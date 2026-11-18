const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');

const BARTOK_URL = process.env.BARTOK_URL || "https://bartok-negocio1.onrender.com/hablar";
const PHONE_NUMBER = process.env.PHONE_NUMBER || "5219671626559";

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const cleanNumber = PHONE_NUMBER.replace(/[^0-9]/g, '');
                console.log(`Solicitando código de emparejamiento para el número: ${cleanNumber}...`);
                const code = await sock.requestPairingCode(cleanNumber);
                console.log('==================================================');
                console.log(` TU CÓDIGO DE EMPAREJAMIENTO ES: ${code} `);
                console.log('==================================================');
            } catch (err) {
                console.error('Error al solicitar el código de emparejamiento:', err.message);
            }
        }, 5000); // Espera 5 segundos a que el socket conecte antes de pedir el código
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('¡Bartok se ha conectado a WhatsApp exitosamente, Jefe!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderID = msg.key.remoteJid;
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!textMessage) return;

        console.log(`Mensaje recibido de ${senderID}: ${textMessage}`);

        try {
            const response = await axios.get(BARTOK_URL, {
                params: { mensaje: textMessage }
            });

            const respuestaBartok = response.data.respuesta || "¡Oh no, Jefe! No obtuve respuesta clara del servidor.";
            await sock.sendMessage(senderID, { text: respuestaBartok });

        } catch (error) {
            console.error('Error al comunicarse con Bartok en Render:', error.message);
            await sock.sendMessage(senderID, { text: "¡Ay, caray, Jefe! Hubo un pequeño fallo al consultar mi memoria en el servidor." });
        }
    });
}

connectToWhatsApp();
      
