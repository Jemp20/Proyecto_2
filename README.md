# Sistema de información para la gestión y trazabilidad de servicios de climatización

Proyecto II — Joel Martínez y Marcela Muñoz

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Base de datos: MySQL 8
- Autenticación: JWT (roles: administrador, técnico, cliente)
- Evidencias: Multer (carpeta `backend/uploads`)

## Estructura
```
climatizacion-system/
├── database/
│   ├── schema.sql          # Tablas del sistema
│   ├── clientes_archivar.sql
│   ├── assistant_readonly.sql
│   ├── assistant_historial.sql
│   └── auth_recuperar_contrasena.sql
├── backend/
│   ├── src/
│   │   ├── config/db.js    # Conexión a MySQL
│   │   └── server.js       # Servidor Express
│   ├── uploads/            # Fotos de evidencia
│   ├── .env.example
│   └── package.json
└── frontend/               # Aplicación React + Vite
```

## Instalación y ejecución

Para instalar el proyecto completo en otra computadora, sigue [GUIA-INSTALACION.md](./GUIA-INSTALACION.md). Incluye los pasos para MySQL, usuario de solo lectura, administrador, Ollama, configuración del entorno y ejecución local en Windows.

El frontend y el backend ya están incluidos en el repositorio; no vuelvas a crear el proyecto Vite. Se requiere Node.js 22 LTS. Tras completar la configuración indicada en la guía, inicia el backend con `npm run dev` dentro de `backend` y el frontend con `npm run dev` dentro de `frontend`. El backend responde en `http://localhost:4000` y el frontend en `http://localhost:5173`.

## Sprints
| Sprint | Fechas | Módulos |
| --- | --- | --- |
| 1 | 15 - 21 oct | Usuarios y autenticación |
| 2 | 22 - 28 oct | Clientes y equipos |
| 3 | 29 oct - 4 nov | Solicitudes y cotizaciones |
| 4 | 5 - 11 nov | Técnicos y agenda |
| 5 | 12 - 18 nov | Órdenes de servicio e historial |

## Recuperación de contraseña

La pantalla de inicio de sesión permite solicitar un enlace de recuperación para cualquier rol. El enlace se envía por SMTP, expira a los 30 minutos y solo se puede usar una vez; el token se guarda en MySQL como hash y el cambio invalida sesiones anteriores. La respuesta no revela si el correo está registrado y las solicitudes se limitan por IP.

Las bases nuevas incluyen las tablas y columnas necesarias en `schema.sql`. En una base existente ejecuta **una sola vez** `database/auth_recuperar_contrasena.sql`. Configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` y `SMTP_PASSWORD` en `backend/.env`; `SMTP_FROM` es opcional. Para Gmail se requiere contraseña de aplicación. En local puedes enviar a un correo real con `CLIENT_URL=http://localhost:5173`; si abres el correo en otro dispositivo de la misma red, configura la IP local y sigue la sección de acceso desde celular en la guía. Para producción usa la URL HTTPS pública del frontend.

## Asistente de consultas

El asistente está disponible para el rol administrador en `/asistente`. Puede responder desde dos fuentes: herramientas de solo lectura para los datos actuales del sistema y documentos PDF/CSV importados desde la interfaz. También permite seleccionar módulos operativos, generar y descargar reportes Excel (`.xlsx`), CSV, PDF o combinaciones, y guardar el contenido como documento consultable desde el chat. El libro Excel incluye resumen, una hoja filtrable por módulo, encabezados con estilo, filas alternas, filtros, formatos numéricos y fechas legibles. El CSV usa UTF-16LE y punto y coma para conservar los acentos y abrirse correctamente en Excel; genera un archivo separado por cada módulo para evitar columnas vacías y datos mezclados. El PDF presenta secciones y tarjetas legibles por registro. Cada generación reemplaza la instantánea anterior de datos del sistema para evitar resultados desactualizados. La copia de datos se indexa automáticamente, por lo que no es necesario volver a importar los reportes generados. La exportación permite hasta 500 registros por módulo y omite datos de contacto. El modo **Automático** usa la base de datos para preguntas operativas, consulta los documentos para temas como normatividad y procedimientos, y recurre a documentos pertinentes si la conexión de solo lectura no está disponible. También se puede elegir explícitamente la fuente. Los documentos se procesan en el backend, se dividen en fragmentos y solo los fragmentos pertinentes a la pregunta se envían al modelo; la respuesta identifica sus fuentes. Se permiten hasta 20 archivos de 15 MB cada uno. El directorio persistente se configura con `ASSISTANT_DOCUMENTS_DIR` (por defecto `backend/uploads/asistente`). No se genera SQL libre. La sesión de usuario y el historial siguen requiriendo la base de datos principal; el modo documental evita depender de la conexión de solo lectura para responder, pero no sustituye la autenticación ni la persistencia del historial. El historial se sincroniza entre equipos que usan la misma base de datos, con un máximo de 100 mensajes.

El asistente reconoce también términos como “propuestas” para consultar cotizaciones, y especifica el criterio cuando una consulta de mantenimiento devuelve cero resultados (vencidos, próximos a vencer o ambos).

En bases de datos existentes, ejecuta una vez el archivo `database/assistant_historial.sql` desde MySQL Workbench (o con el cliente MySQL):
```bash
mysql -u root -p < database/assistant_historial.sql
```

En una base existente ejecuta también `database/clientes_archivar.sql` para habilitar el archivado de clientes. Archivar conserva sus equipos y solicitudes, oculta al cliente de la lista activa y bloquea la cuenta vinculada. Puedes consultar los archivados y restaurarlos desde el módulo Clientes.

### Clientes archivados

En **Clientes**, usa **Archivar** para retirar un cliente de las listas activas sin borrar equipos, solicitudes, cotizaciones ni su historial. Si tiene una cuenta, el acceso se bloquea, incluso para sesiones abiertas. Activa **Mostrar clientes archivados** para consultar el perfil o restaurarlo; al restaurar, se recupera el estado de acceso que tenía antes del archivado.

La cuenta MySQL del asistente tiene permisos `SELECT` limitados a las columnas necesarias. No se exponen correos, teléfonos, direcciones, documentos, contraseñas ni textos libres de diagnóstico. El historial usa la conexión principal del backend, protegida por autenticación de administrador, y no amplía los permisos de la cuenta de solo lectura. El servidor genera las respuestas con los resultados reales y no envía filas de la base de datos al modelo. El filtro “próxima semana” cubre la siguiente semana calendario (lunes a domingo) y solo visitas programadas o reprogramadas.

1. Crea una cuenta dedicada con permisos de solo lectura:
   ```bash
   mysql -u root -p < database/assistant_readonly.sql
   ```
   Cambia primero la contraseña de ejemplo en ese archivo y configura el mismo valor en `DB_READONLY_PASSWORD`.
   Si la cuenta ya existía, vuelve a ejecutar el contenido actualizado de `database/assistant_readonly.sql` en MySQL Workbench para agregar los permisos de lectura de los módulos habilitados. Los `GRANT` no cambian la contraseña de la cuenta existente.
2. Configura `AI_BASE_URL` y `AI_MODEL` en `backend/.env`. Para las consultas operativas usa un modelo compatible con llamadas a herramientas; el modo documental también usa el modelo para redactar respuestas con los fragmentos recuperados. Por defecto se usa Ollama en `http://127.0.0.1:11434/v1`. `AI_API_KEY` solo se requiere si el proveedor lo exige. `AI_TIMEOUT_MS` ajusta el tiempo máximo de espera (1000–120000 ms). `ASSISTANT_DOCUMENTS_DIR` permite elegir dónde persistir los documentos importados.
3. Reinicia el backend. Usa Node.js 22 LTS para cumplir los requisitos del backend y de la integración SMTP.

Si no están configurados el modelo o sus credenciales, el asistente no puede generar respuestas. Las preguntas documentales pueden responderse sin configurar el usuario MySQL de solo lectura; las preguntas operativas requieren esa conexión.

### Telegram opcional

El bot de Telegram permite enviar preguntas al mismo asistente desde un chat privado. Crea el bot con `@BotFather`, guarda su token únicamente en `backend/.env` como `TELEGRAM_BOT_TOKEN` y reinicia el backend. No compartas el token ni lo subas al repositorio.

En una base existente ejecuta `database/assistant_telegram.sql`; en instalaciones nuevas las tablas ya vienen en `schema.sql`. Inicia sesión como administrador, genera un código en la sección Telegram de `/asistente` y envíalo al bot como `/start CODIGO` en un chat privado. El código vence en 10 minutos y solo puede utilizarse una vez. Los grupos y chats no vinculados no pueden consultar datos. El administrador puede desvincular el chat desde la web o con `/desvincular`. Las listas de registros se muestran en páginas de dos elementos con botones de navegación; estos botones expiran después de 30 minutos y se invalidan al reiniciar el backend.

El backend usa long polling: no necesita exponer una URL pública, pero el equipo donde corre debe permanecer encendido, conectado a Internet y con backend, MySQL y el proveedor de IA disponibles. Solo debe correr una instancia del bot por token. Las preguntas y respuestas se transmiten por Telegram; no envíes información sensible por ese canal. Para todos los pasos de instalación, consulta [GUIA-INSTALACION.md](./GUIA-INSTALACION.md).

En `/asistente`, **Comprobar Telegram** muestra si el sondeo está activo, reconectando o en conflicto, además del estado de vinculación. Si indica un conflicto, detén cualquier otra instancia del backend que use el mismo token (o elimina un webhook configurado) y reinicia el backend.

Para ejecutar las pruebas automatizadas del enrutamiento del asistente y de sus respuestas de ayuda, usa `npm --prefix backend test`.
