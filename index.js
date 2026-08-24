const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

// Memoria temporal para guardar el estado de cada usuario mientras chatean
// Estructura: { "numero@s.whatsapp.net": { paso: "INICIO", nombre: "", correo: "", flujo: "" } }
const usuariosEstado = {};

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
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
            console.log('¡Bot conectado exitosamente y listo para seguir el diagrama!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        
        const remitente = m.key.remoteJid;
        const texto = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();

        // Si el usuario no tiene un estado registrado, lo inicializamos en el paso de Bienvenida
        if (!usuariosEstado[remitente]) {
            usuariosEstado[remitente] = { paso: 'ESPERANDO_NOMBRE', flujo: '' };
            
            await sock.sendMessage(remitente, { 
                text: '🤖 *¡Bienvenido a AriasDeveloper!* Estamos aquí para ayudarte con todas las necesidades de Software y tecnología.\n\n¿Cuál es tu nombre?' 
            });
            return;
        }

        const estado = usuariosEstado[remitente];

        // MÁQUINA DE ESTADOS SEGÚN EL DIAGRAMA
        switch (estado.paso) {
            
            // PASO 1: Capturar Nombre -> Pedir Correo
            case 'ESPERANDO_NOMBRE':
                estado.nombre = texto;
                estado.paso = 'ESPERANDO_CORREO';
                await sock.sendMessage(remitente, { 
                    text: `Mucho gusto, *${estado.nombre}*.\n\n¿Cuál es tu correo electrónico?` 
                });
                break;

            // PASO 2: Capturar Correo -> Mostrar Menú Principal
            case 'ESPERANDO_CORREO':
                estado.correo = texto;
                estado.paso = 'MENU_PRINCIPAL';
                
                await sock.sendMessage(remitente, { 
                    text: `¡Gracias! Hemos registrado tu correo.\n\n¿Cómo podemos dirigirte hoy? Responde con el número de tu opción:\n\n*1.* Catálogo Web\n*2.* Gestionar Clientes\n*3.* Otro / Consultas generales` 
                });
                break;

            // PASO 3: Menú Principal (Opciones 1, 2 o 3)
            case 'MENU_PRINCIPAL':
                if (texto === '1' || texto === '2' || texto === '3') {
                    estado.flujo = texto;
                    estado.paso = 'MENU_FAQ';

                    await sock.sendMessage(remitente, { 
                        text: `Perfecto. Seleccionaste la opción ${texto}.\n\nSelecciona una de las siguientes preguntas frecuentes para ayudarte mejor:\n\n*1.* ¿Cuáles son los precios o tarifas?\n*2.* ¿Cuánto se tarda un proyecto?\n*3.* ¿Qué debo entregar para empezar?\n*4.* ¿Hay garantías?\n*5.* Hablar directamente con un especialista (Humano)` 
                    });
                } else {
                    await sock.sendMessage(remitente, { 
                        text: '⚠️ Por favor, responde con un número válido: *1*, *2* o *3*.' 
                    });
                }
                break;

            // PASO 4: Menú de Preguntas Frecuentes (FAQ)
            case 'MENU_FAQ':
                if (texto === '1') {
                    await sock.sendMessage(remitente, { 
                        text: '💰 Pueden variar un poco según las promociones actuales y algunos requerimientos específicos del cliente, aunque el promedio estándar ronda entre los *10-35 Usdt*.' 
                    });
                    await finalizarOContinuar(sock, remitente, estado);
                } else if (texto === '2') {
                    await sock.sendMessage(remitente, { 
                        text: '⏱️ Todos los proyectos se gestionan bajo estricta planificación y se estima una duración de *7 días*.' 
                    });
                    await finalizarOContinuar(sock, remitente, estado);
                } else if (texto === '3') {
                    await sock.sendMessage(remitente, { 
                        text: '📁 De tener imágenes, vídeos o audios alusivos a tu negocio o marca nos ayudaría muchísimo a crear el proyecto exactamente a tu estilo y huella, aunque estamos 100% dispuesto a ayudarte y ofrecerte nuestras habilidades de diseño y personalización.' 
                    });
                    await finalizarOContinuar(sock, remitente, estado);
                } else if (texto === '4') {
                    await sock.sendMessage(remitente, { 
                        text: '🛡️ Todos nuestros proyectos incluyen garantías y nos hacemos 100% responsables de su gestión, corrección de errores y su funcionamiento para su mayor comodidad.' 
                    });
                    await finalizarOContinuar(sock, remitente, estado);
                } else if (texto === '5') {
                    estado.paso = 'ATENCION_HUMANA';
                    await sock.sendMessage(remitente, { 
                        text: '👥 Entendido. Un breve momento y te atenderá un especialista. Cuéntanos, ¿qué dudas tienes exactamente?' 
                    });
                } else {
                    await sock.sendMessage(remitente, { 
                        text: '⚠️ Selecciona un número válido del *1* al *5*.' 
                    });
                }
                break;

            // PASO 5: Derivación a Humano / Dudas libres
            case 'ATENCION_HUMANA':
                await sock.sendMessage(remitente, { 
                    text: '✅ Hemos tomado nota de tu caso. Un especialista revisará este chat en breve. ¡Gracias por elegirnos!' 
                });
                // Opcional: Reiniciamos o dejamos el flujo abierto
                break;

            default:
                // Si el usuario escribe algo fuera de lugar, reiniciamos o guiamos
                estado.paso = 'MENU_PRINCIPAL';
                await sock.sendMessage(remitente, { text: 'Escribe *1*, *2* o *3* para ver el menú principal.' });
                break;
        }
    });
}

// Función auxiliar para repetir el menú o dar cierre tras responder una FAQ
async function finalizarOContinuar(sock, remitente, estado) {
    await sock.sendMessage(remitente, { 
        text: '¿Tienes alguna otra duda o deseas contactar a un especialista?\n\n*1.* Volver al menú de preguntas\n*2.* Hablar con un especialista' 
    });
    estado.paso = 'POST_FAQ';
}

// Manejo extra por si están en el paso post-respuesta
// (Puedes agregarlo si quieres que el bot sea cíclico, por ahora el flujo básico cubre todo el diagrama).

iniciarBot();