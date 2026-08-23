const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function iniciarBot() {
    // Esto guarda la sesión para que no tengas que escanear el QR cada vez que reinicies
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }) // Silencia los logs innecesarios para ver el QR limpio
    });

    sock.ev.on('creds.update', saveCreds);

    // Evento de conexión para ver el estado y el Código QR
    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
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

        // Responde automáticamente si te escriben "hola"
        if (textoMensaje && textoMensaje.toLowerCase() === 'hola') {
            await sock.sendMessage(numeroRemitente, { text: '¡Hola! Estoy vivo y corriendo desde GitHub Codespaces 🤖' });
        }
    });
}

iniciarBot();