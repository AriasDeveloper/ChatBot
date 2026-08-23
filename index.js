const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal'); // Lo usaremos para forzar el dibujo del QR

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    // Manejar conexión y mostrar código QR
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Si hay un código QR disponible, lo imprimimos en la terminal
        if (qr) {
            console.log('Escanea este código QR con tu WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. ¿Reconectando?: ', shouldReconnect);
            if (shouldReconnect) {
                iniciarBot();
            }
        } else if (connection === 'open') {
            console.log('¡Bot conectado exitosamente a WhatsApp!');
        }
    });

    // Escuchar mensajes entrantes
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        
        const numeroRemitente = m.key.remoteJid;
        const textoMensaje = m.message.conversation || m.message.extendedTextMessage?.text;

        console.log(`Mensaje recibido de ${numeroRemitente}: ${textoMensaje}`);

        if (textoMensaje && textoMensaje.toLowerCase() === 'hola') {
            await sock.sendMessage(numeroRemitente, { text: '¡Hola! Estoy vivo y corriendo desde GitHub Codespaces 🤖' });
        }
    });
}

iniciarBot();