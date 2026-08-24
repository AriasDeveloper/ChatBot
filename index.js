const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express'); // <-- Servidor web para mantener vivo a Render 24/7

// --- SERVIDOR WEB EXPRESS PARA RENDER ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('¡El bot de AriasDeveloper está activo y corriendo 24/7!');
});

app.listen(PORT, () => {
    console.log(`Servidor web corriendo en el puerto ${PORT}`);
});
// ----------------------------------------

// Memoria temporal para guardar el estado de cada usuario
const usuariosEstado = {};

const MENU_FAQ_TEXTO = `🤖 ¿Tienes alguna otra duda o deseas consultar algo más? Selecciona una opción:\n\n*1.* ¿Cuáles son los precios o tarifas?\n*2.* ¿Cuánto se tarda un proyecto?\n*3.* ¿Qué debo entregar para empezar?\n*4.* ¿Hay garantías?\n*5.* Hablar directamente con un especialista (Humano)\n\n\n(Escribe ariasoff si quieres cerrar el Bot)`;

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }) // <-- 'silent' oculta todos esos reportes técnicos de Baileys
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('Escanea este código QR con tu WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) iniciarBot();
        } else if (connection === 'open') {
            console.log('¡Bot conectado exitosamente con las nuevas reglas!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        
        const remitente = m.key.remoteJid;

        // 🛑 FILTRO DE SEGURIDAD: Si el mensaje viene de un grupo, lo ignoramos de inmediato
        if (remitente.endsWith('@g.us')) {
            return;
        }

        const texto = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();
        const textoLower = texto.toLowerCase();

        // ... el resto de tu código sigue exactamente igual ...

        // 1. COMANDO GLOBAL: 'ariasoff' apaga el bot para este usuario
        if (textoLower === 'ariasoff') {
            usuariosEstado[remitente] = { paso: 'APAGADO' };
            await sock.sendMessage(remitente, { 
                text: '🔴 Has cerrado el bot. El asistente automático se ha detenido. Si deseas reactivarlo más adelante, escribe *ariasbot*.' 
            });
            return;
        }

        // Si el usuario está apagado o en pausa, solo reacciona a 'ariasbot'
        if (usuariosEstado[remitente] && (usuariosEstado[remitente].paso === 'APAGADO' || usuariosEstado[remitente].paso === 'PAUSADO')) {
            if (textoLower === 'ariasbot') {
                usuariosEstado[remitente] = { paso: 'MENU_PRINCIPAL', nombre: 'Usuario', correo: '' };
                await sock.sendMessage(remitente, { 
                    text: '🟢 ¡Hola de nuevo! El bot ha sido reactivado.\n\n¿Cómo podemos dirigirte hoy? Responde con el número de tu opción:\n\n*1.* Catálogo Web\n*2.* Gestionar Clientes\n*3.* Otro / Consultas generales\n\n\n(Escribe ariasoff si quieres cerrar el Bot)' 
                });
            }
            return; 
        }

        // Si el usuario no tiene estado, iniciamos bienvenida
        if (!usuariosEstado[remitente]) {
            usuariosEstado[remitente] = { paso: 'ESPERANDO_NOMBRE', flujo: '' };
            await sock.sendMessage(remitente, { 
                text: '🤖 *¡Bienvenido a AriasDeveloper!* Estamos aquí para ayudarte con todas las necesidades de Software y tecnología.\n\n¿Cuál es tu nombre?\n\n\n(Escribe ariasoff si quieres cerrar el Bot)' 
            });
            return;
        }

        const estado = usuariosEstado[remitente];

        switch (estado.paso) {
            case 'ESPERANDO_NOMBRE':
                estado.nombre = texto;
                estado.paso = 'ESPERANDO_CORREO';
                await sock.sendMessage(remitente, { 
                    text: `🤖 Mucho gusto, *${estado.nombre}*.\n\n¿Cuál es tu correo electrónico?\n\n\n(Escribe ariasoff si quieres cerrar el Bot)` 
                });
                break;

            case 'ESPERANDO_CORREO':
                estado.correo = texto;
                estado.paso = 'MENU_PRINCIPAL';
                await sock.sendMessage(remitente, { 
                    text: `🤖 ¡Gracias! Hemos registrado tu correo.\n\n¿Cómo podemos dirigirte hoy? Responde con el número de tu opción:\n\n*1.* Catálogo Web\n*2.* Gestionar Clientes\n*3.* Otro / Consultas generales\n\n\n(Escribe ariasoff si quieres cerrar el Bot)` 
                });
                break;

            case 'MENU_PRINCIPAL':
                if (texto === '1' || texto === '2' || texto === '3') {
                    estado.flujo = texto;
                    estado.paso = 'MENU_FAQ';
                    await sock.sendMessage(remitente, { text: MENU_FAQ_TEXTO });
                } else {
                    await sock.sendMessage(remitente, { 
                        text: '⚠️ Por favor, responde con un número válido: *1*, *2* o *3*.\n\n\n(Escribe ariasoff si quieres cerrar el Bot)' 
                    });
                }
                break;

            case 'MENU_FAQ':
                if (texto === '1') {
                    await sock.sendMessage(remitente, { 
                        text: '💰 Pueden variar un poco según las promociones actuales y algunos requerimientos específicos del cliente, aunque el promedio estándar ronda entre los *10-35 Usdt*.\n\n\n(Escribe ariasoff si quieres cerrar el Bot)' 
                    });
                    await sock.sendMessage(remitente, { text: MENU_FAQ_TEXTO });
                } else if (texto === '2') {
                    await sock.sendMessage(remitente, { 
                        text: '⏱️ Todos los proyectos se gestionan bajo estricta planificación y se estima una duración de *7 días*.\n\n\n(Escribe ariasoff si quieres cerrar el Bot)' 
                    });
                    await sock.sendMessage(remitente, { text: MENU_FAQ_TEXTO });
                } else if (texto === '3') {
                    await sock.sendMessage(remitente, { 
                        text: '📁 De tener imágenes, vídeos o audios alusivos a tu negocio o marca nos ayudaría muchísimo a crear el proyecto exactamente a tu estilo y huella, aunque estamos 100% dispuesto a ayudarte y ofrecerte nuestras habilidades de diseño y personalización.\n\n\n(Escribe ariasoff si quieres cerrar el Bot)' 
                    });
                    await sock.sendMessage(remitente, { text: MENU_FAQ_TEXTO });
                } else if (texto === '4') {
                    await sock.sendMessage(remitente, { 
                        text: '🛡️ Todos nuestros proyectos incluyen garantías y nos hacemos 100% responsables de su gestión, corrección de errores y su funcionamiento para su mayor comodidad.\n\n\n(Escribe ariasoff si quieres cerrar el Bot)' 
                    });
                    await sock.sendMessage(remitente, { text: MENU_FAQ_TEXTO });
                } else if (texto === '5') {
                    estado.paso = 'PAUSADO';
                    await sock.sendMessage(remitente, { 
                        text: '👥 Hemos tomado nota de tu caso y un especialista se pondrá en contacto contigo.\n\nEl bot ha finalizado su atención automática. Si deseas reactivarlo más adelante, escribe *ariasbot*.' 
                    });
                } else {
                    await sock.sendMessage(remitente, { 
                        text: '⚠️ Selecciona un número válido del *1* al *5*.\n\n\n(Escribe ariasoff si quieres cerrar el Bot)' 
                    });
                }
                break;

            default:
                estado.paso = 'MENU_PRINCIPAL';
                await sock.sendMessage(remitente, { text: '🤖 Escribe *1*, *2* o *3* para ver el menú principal.\n\n\n(Escribe ariasoff si quieres cerrar el Bot)' });
                break;
        }
    });
}

iniciarBot();