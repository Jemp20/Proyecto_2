# Guía de instalación para la presentación

Esta guía instala el sistema y el asistente web en una computadora Windows. La instalación usa una base de datos MySQL local y un modelo de IA local con Ollama. No se necesita Telegram para usar el chatbot web.

## 1. Requisitos

Instala en la computadora:

- Git, para descargar el proyecto.
- Node.js 22 LTS (incluye npm).
- MySQL Server 8 y MySQL Workbench.
- Ollama para Windows.

Se recomienda Node.js 22 LTS para que sea compatible tanto con el backend como con Vite.

## 2. Descargar el proyecto

Abre PowerShell y ejecuta:

```powershell
git clone <URL-DEL-REPOSITORIO>
cd climatizacion-system
```

Si el proyecto se entrega como archivo ZIP, descomprímelo y abre PowerShell en la carpeta `climatizacion-system`.

## 3. Crear la base de datos

En MySQL Workbench, conéctate al servidor local y abre `database/schema.sql`. Ejecuta el archivo completo. Esto crea la base `climatizacion` y sus tablas.
Si el sistema ya tenía la base creada antes de esta versión, ejecuta una sola vez `database/clientes_archivar.sql` para agregar los campos de archivado.
Para una base ya existente, ejecuta también una sola vez `database/auth_recuperar_contrasena.sql` para habilitar la recuperación de contraseñas.

Para comprobar la conexión en Workbench:

```sql
SELECT @@hostname AS servidor, @@port AS puerto, DATABASE() AS base;
```

El backend de esta instalación usará `localhost:3306` y la base `climatizacion`.

### Datos de demostración

`schema.sql` crea las tablas, pero no copia automáticamente los datos que existen en otra computadora.

- Para comenzar con una base vacía, no hagas nada más en este paso.
- Para presentar los mismos registros de demostración, exporta la base de origen con MySQL Workbench usando **Data Export** y seleccionando la estructura y los datos. Copia el archivo de exportación a la otra computadora e impórtalo con **Data Import/Restore**. Haz esta importación antes de crear el administrador y el usuario de solo lectura.

No compartas archivos `.env`, contraseñas ni claves JWT. El archivo de exportación de la base puede contener datos personales; compártelo solo por un medio privado y con autorización.

## 4. Crear el usuario de solo lectura del asistente

En Workbench, abre `database/assistant_readonly.sql`. Antes de ejecutarlo, reemplaza `REEMPLAZAR_ANTES_DE_EJECUTAR` por una contraseña nueva y segura. Ejecuta el archivo con una cuenta MySQL administradora.

El script crea `climatizacion_asistente` con permisos de lectura limitados a las columnas que necesita el chatbot. Si el usuario ya existía, `CREATE USER IF NOT EXISTS` no cambia su contraseña: en ese caso, utiliza la contraseña ya configurada para ese usuario.

La tabla de historial se incluye en `schema.sql`. Para instalaciones existentes o importaciones antiguas, ejecuta también `database/assistant_historial.sql` en Workbench.

## 5. Configurar el backend

En PowerShell, desde la raíz del proyecto:

```powershell
Copy-Item backend\.env.example backend\.env
```

Edita `backend\.env` localmente. No subas ni envíes ese archivo. Configura estos valores según MySQL y la contraseña que pusiste en el script de solo lectura:

```env
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=CONTRASEÑA_DE_MYSQL
DB_NAME=climatizacion
DB_READONLY_USER=climatizacion_asistente
DB_READONLY_PASSWORD=CONTRASEÑA_DEL_USUARIO_SOLO_LECTURA

AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=qwen2.5:3b
AI_API_KEY=
AI_TIMEOUT_MS=60000
ASSISTANT_DOCUMENTS_DIR=./uploads/asistente
TELEGRAM_BOT_TOKEN=

JWT_SECRET=CAMBIAR_POR_UN_SECRETO_LARGO_Y_ALEATORIO
JWT_EXPIRES_IN=8h
CLIENT_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-correo@gmail.com
SMTP_PASSWORD=CONTRASENA_DE_APLICACION
SMTP_FROM="ThermoAssist <tu-correo@gmail.com>"
```

La recuperación de contraseña envía un enlace de un solo uso, válido por 30 minutos, al correo de la cuenta. Para configurar Gmail:

1. Inicia sesión en la cuenta Gmail que enviará los mensajes y abre [myaccount.google.com/security](https://myaccount.google.com/security).
2. En **Cómo inicias sesión en Google**, configura y activa **Verificación en dos pasos** si aún no está activa.
3. Después de activarla, vuelve a **Seguridad** y busca **Contraseñas de aplicaciones**. También puedes abrir [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). Google puede pedirte iniciar sesión de nuevo.
4. Crea una contraseña de aplicación. Ponle un nombre para reconocerla, como `ThermoAssist`, y pulsa **Crear**.
5. Copia la contraseña que Google muestra. En el archivo `backend\.env`, completa `SMTP_USER` con el correo Gmail y `SMTP_PASSWORD` con esa contraseña de aplicación. Si Google la muestra separada en grupos, escríbela sin espacios. No uses la contraseña normal de Gmail.
6. En `SMTP_FROM`, usa el mismo correo remitente. Mantén `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587` y `SMTP_SECURE=false`.
7. Guarda `backend\.env` y reinicia el backend. Solicita un enlace de recuperación para una cuenta existente y revisa también la carpeta de spam.

La contraseña de aplicación es un secreto: no la pegues en el chat, no la incluyas en capturas ni la compartas en el ZIP. Si no aparece **Contraseñas de aplicaciones**, confirma que la verificación en dos pasos está activa; algunas cuentas de trabajo/estudio administradas por una organización o cuentas con ciertos métodos de seguridad pueden no permitir esa opción. En ese caso, utiliza otra cuenta Gmail compatible o un proveedor SMTP distinto.

Con `CLIENT_URL=http://localhost:5173`, el enlace sirve en el mismo computador donde se ejecuta el frontend local. En producción, cambia `CLIENT_URL` por la dirección HTTPS pública del sitio.

**Si abres el correo en un celular mientras el sistema corre en el computador:** `localhost` en el enlace significa “este mismo celular”, por eso no conectará al computador. Conecta ambos a la misma Wi-Fi y usa la IPv4 privada del computador (por ejemplo, `192.168.1.25`):

1. En PowerShell del computador, ejecuta `ipconfig` y busca la **Dirección IPv4** del adaptador Wi-Fi.
2. En `backend\.env`, establece `CLIENT_URL=http://IP-DEL-COMPUTADOR:5173` y permite ambas direcciones web con `CLIENT_ORIGINS=http://localhost:5173,http://IP-DEL-COMPUTADOR:5173`.
3. En `frontend`, crea `.env.local` con `VITE_API_URL=http://IP-DEL-COMPUTADOR:4000/api`.
4. Inicia Vite con `npm run dev -- --host 0.0.0.0` y el backend normalmente con `npm run dev`. Si Windows pregunta, permite Node.js en la red privada.
5. Solicita un **enlace nuevo** y ábrelo desde el celular. La dirección del ejemplo debe usar la misma IPv4 que configuraste en ambos archivos. Si cambia la IP o la red Wi-Fi, actualiza esos valores y reinicia ambos servidores.

No uses esta configuración de desarrollo como despliegue público; el enlace local solo funciona dentro de la misma red.

No compartas ni subas las credenciales SMTP. Si tu proveedor usa el puerto 465, configura `SMTP_PORT=465` y `SMTP_SECURE=true`; para el puerto 587 usa `SMTP_SECURE=false`.

Genera un secreto JWT nuevo en PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copia el resultado en `JWT_SECRET`. No reutilices la clave de otra computadora.

Instala las dependencias y crea la cuenta administradora:

```powershell
Set-Location backend
npm install
node src\scripts\crear-admin.js "Administradora" "admin@ejemplo.com" "CAMBIAR_POR_UNA_CLAVE_SEGURA"
Set-Location ..
```

Usa el nombre, correo y contraseña elegidos para la presentación. El comando requiere una contraseña de al menos 8 caracteres.

## 6. Instalar y preparar el modelo local

Abre Ollama y, en PowerShell, descarga el modelo:

```powershell
ollama pull qwen2.5:3b
ollama list
```

Confirma que `qwen2.5:3b` aparece en la lista. Ollama debe seguir ejecutándose mientras se usa el asistente. El asistente consulta datos mediante herramientas autorizadas; el modelo no genera SQL libre.

En `/asistente`, importa hasta 20 archivos PDF o CSV de hasta 15 MB cada uno para consultar normatividad, procedimientos y reportes. También puedes marcar módulos del sistema y elegir **Generar archivos** para crear un libro Excel (`.xlsx`), archivos CSV, un PDF o combinaciones. El libro Excel incluye resumen y hojas por módulo con filtros, formato y fechas legibles; el PDF presenta cada registro en tarjetas. El CSV usa UTF-16LE y punto y coma para conservar acentos en Excel, y se genera un archivo separado por módulo seleccionado para evitar columnas vacías y datos mezclados. La copia de datos se añade automáticamente a los documentos consultables, por lo que no es necesario importar de nuevo los reportes generados; cada generación sustituye esa copia del sistema por la más reciente. Se exportan hasta 500 registros por módulo y se omiten teléfonos, correos y direcciones. El modo **Automático** usa los datos operativos cuando están disponibles y puede responder desde los documentos si MySQL de solo lectura no está conectado; también puedes seleccionar explícitamente **Documentos PDF/CSV**. Los archivos se guardan en `ASSISTANT_DOCUMENTS_DIR` (por defecto `backend/uploads/asistente`); conserva ese directorio al cambiar de equipo o hacer una copia de seguridad. La autenticación y el historial de conversación siguen dependiendo de la base de datos principal.

## 7. Instalar e iniciar el frontend

Desde la raíz del proyecto:

```powershell
Set-Location frontend
npm install
npm run dev
```

Deja esta terminal abierta. Vite mostrará una dirección local, normalmente `http://localhost:5173`.

## 8. Iniciar el backend

Abre una segunda ventana de PowerShell en la raíz del proyecto:

```powershell
Set-Location backend
npm run dev
```

Deja también esta terminal abierta. Comprueba en el navegador:

```text
http://localhost:4000/api/health
```

Debe responder:

```json
{"ok":true,"db":"conectada"}
```

Abre `http://localhost:5173`, inicia sesión con la cuenta administradora y entra a **Asistente de consultas**.

## 9. Comprobaciones antes de presentar

1. Inicia sesión como administrador.
2. Confirma que el asistente carga el historial sin mostrar errores.
3. Prueba consultas de órdenes, cotizaciones, equipos y mantenimientos.
4. Comprueba que Ollama continúa activo si el modelo necesita responder una pregunta que no reconoce el enrutamiento directo.
5. Si usa una base vacía, añade datos de demostración autorizados antes de esperar resultados distintos de cero.

Pruebas automatizadas del backend:

```powershell
npm --prefix backend test
```

Build de producción del frontend:

```powershell
npm --prefix frontend run build
```

## 10. Historial y uso en varios equipos

El historial se guarda en la base MySQL del backend, separado por cuenta administradora. En dos instalaciones locales independientes, cada equipo tendrá una base e historial separados. Para ver los mismos datos e historial desde ambos equipos, ambos deben conectarse al mismo backend y a la misma base de datos.

## 11. Activar Telegram (opcional)

Telegram agrega un canal móvil para hacer preguntas al asistente. En esta modalidad local, el backend consulta a Telegram mediante long polling; no hace falta publicar el backend en Internet. El PC debe permanecer encendido, conectado a Internet y tener disponibles MySQL y Ollama.

1. En Telegram, abre el chat de `@BotFather`, envía `/newbot` y sigue sus instrucciones para asignar nombre y usuario al bot.
2. Copia el token que entrega BotFather directamente en `backend\.env`, en `TELEGRAM_BOT_TOKEN`. No lo envíes por chat, no lo incluyas en capturas ni lo subas al repositorio.
3. Si la base ya existía antes de instalar esta versión, ejecuta `database/assistant_telegram.sql` en Workbench. En una base nueva, `schema.sql` ya crea las tablas de vinculación.
4. Reinicia el backend. En su terminal debe aparecer `Bot de Telegram iniciado con long polling.`. En la sección Telegram del asistente web, pulsa **Comprobar Telegram** para confirmar el estado del sondeo y la vinculación.
5. Inicia sesión como administrador en el sitio web, abre **Asistente de consultas** y genera el código temporal de Telegram.
6. Busca el bot que creaste en Telegram y, desde un chat privado, envíale `/start CODIGO` usando el código mostrado en la web. El código vence en 10 minutos y solo puede usarse una vez.
7. Cuando el bot confirme la vinculación, envíale una pregunta de prueba. Puedes escribir `/ayuda` para ver ejemplos o `/desvincular` para retirar el acceso.

La vinculación solo se permite a una cuenta activa con rol administrador y un chat privado. Los grupos no pueden consultar el asistente. Las listas extensas se presentan de dos registros por página; los botones de navegación vencen a los 30 minutos o al reiniciar el backend. También puedes revocar el acceso desde la web. Ejecuta una sola instancia del backend por token de bot: Telegram no permite que dos procesos hagan long polling simultáneamente con el mismo token.

Las preguntas y respuestas se envían a Telegram para entregar el servicio; evita transmitir datos sensibles por el bot. El token es una credencial: si se expone, revócalo con BotFather y configura el token nuevo en el `.env`.

## Solución de problemas

- **`Table 'climatizacion.asistente_historial' doesn't exist`:** ejecuta `database/assistant_historial.sql` en la misma instancia MySQL a la que apunta `DB_HOST` y `DB_PORT`.
- **`Table 'climatizacion.asistente_telegram_vinculos' doesn't exist`:** ejecuta `database/assistant_telegram.sql` en la instancia MySQL usada por el backend.
- **Falla el inicio de sesión o `/api/health` falla:** revisa `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` en `backend\.env`; nunca compartas el valor de la contraseña.
- **No llega el correo para recuperar la contraseña:** revisa `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` y `SMTP_PASSWORD` en `backend\.env`; en Gmail usa una contraseña de aplicación. Revisa también la carpeta de spam y confirma que `CLIENT_URL` apunte al frontend correcto.
- **`Table 'climatizacion.recuperacion_contrasena' doesn't exist` o falta `auth_version`:** ejecuta una sola vez `database/auth_recuperar_contrasena.sql` en la base usada por el backend.
- **El asistente indica que no puede autenticar el usuario de solo lectura:** revisa que `DB_READONLY_USER` y `DB_READONLY_PASSWORD` coincidan con el usuario creado mediante `assistant_readonly.sql`.
- **No fue posible conectar con el proveedor de IA:** comprueba que Ollama esté abierto, que `ollama list` muestre `qwen2.5:3b`, y que `AI_BASE_URL` y `AI_MODEL` estén configurados correctamente.
- **El diagnóstico de Telegram indica conflicto:** detén cualquier otra copia del backend que use el mismo token y elimina cualquier webhook asociado. Reinicia el backend y actualiza el diagnóstico en la web.
- **El asistente responde que no encontró registros:** verifica que la base importada contenga datos y que la pregunta consulte el estado o fecha esperados.
- **El asistente no encuentra información en los archivos:** confirma que el PDF contenga texto seleccionable (los documentos escaneados requieren OCR antes de importarlos), o busca el archivo CSV en la lista y formula la pregunta con sus términos exactos.

No incluyas `.env`, contraseñas, tokens, claves ni volcados de bases con datos personales en repositorios públicos o chats.

## Archivado de clientes

Desde el detalle de un cliente, **Archivar** lo oculta de la lista activa y conserva sus equipos y solicitudes. Si está vinculado a una cuenta, esta queda bloqueada incluso si ya tenía una sesión abierta. Para ver o restaurar clientes archivados, activa **Mostrar clientes archivados** en la página Clientes. La restauración devuelve el acceso solo si la cuenta estaba activa antes de archivar.
