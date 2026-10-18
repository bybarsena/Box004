# Box 004 · Catálogo, pedidos y administración

Reconstrucción de la aplicación de pedidos. Preparada para un proyecto NUEVO de Supabase y una cuenta nueva de Vercel. No modifica la base de datos original ni recupera pedidos antiguos.

## Funciones

- Catálogo público: modelos, tallas, colores y varias fotos por color.
- Reserva de varias prendas; cálculo de importes y descuentos en la base de datos.
- Administración privada con correo, contraseña, recuperación y alta mediante invitación.
- Gestión de productos, variantes y fotos; 12 imágenes recuperadas incluidas.
- Pedidos web y registro manual de pedidos pendientes.
- Estados: pendiente, encargado, listo para recoger, entregado y cancelado.
- Registro de importe cobrado, notas internas, filtros, resumen de importes y exportación CSV para Excel.
- Notificación opcional de pedidos a `santiago@box004.com` mediante Resend.
- No incluye pagos online. La reserva se registra y el centro coordina pago y recogida.

## Estado de esta entrega

Código compilado y pruebas locales superadas. NO desplegado y NO conectado a una base de datos real. La cuenta nueva de Vercel todavía debe conectarse. Ningún producto, precio o pedido real se ha inventado o cargado.

## Instalación

1. Crear un proyecto dedicado de Supabase. No ejecutar estos archivos en FILE ni Oposita.
2. Ejecutar `database/install.sql` una sola vez desde SQL Editor del proyecto NUEVO. Todo está dentro de una transacción: si hay un error, no continuar hasta resolverlo.
3. En Supabase Auth, desactivar el registro público de usuarios. Configurar Site URL con el dominio de producción y autorizar la URL de redirección `https://TU-DOMINIO/admin?setPassword=1`. Configurar el correo SMTP si el remitente predeterminado limita las invitaciones.
4. Importar este código en Vercel con framework Next.js. Si se usa GitHub, importar la rama de reconstrucción, sin sustituir el despliegue antiguo hasta completar las pruebas.
5. Añadir las tres variables obligatorias de `.env.example`: URL del proyecto, clave publicable y clave secreta del servidor. La clave secreta NUNCA lleva `NEXT_PUBLIC_` ni se guarda en GitHub.
6. Desplegar de nuevo tras añadir las variables: las variables públicas se incorporan durante la compilación.
7. Crear el administrador con una invitación de Supabase Auth para `santiago@box004.com`, después insertar su UUID en `public.admin_users`. Alternativamente, el operador puede ejecutar `node --env-file=.env.local scripts/invite-admin.mjs https://TU-DOMINIO`: envía una invitación y añade su UUID. No ejecutar ambas opciones.
8. El destinatario abre el enlace y establece su contraseña. No hay una contraseña predeterminada, ni es necesario compartirla por chat.
9. En `/admin`, crear una prenda como borrador, editarla para añadir tallas y colores, elegir fotos recuperadas o subir fotos, y publicarla.
10. Probar un pedido, su importe, sus descuentos y su visualización como administrador. Marcar los pedidos de prueba como cancelados al terminar.

La cuenta de Vercel puede ser la cuenta personal del propietario. El administrador y el correo de pedidos permanecen en `santiago@box004.com`.

## Variables opcionales de correo

`RESEND_API_KEY`, `BOX004_EMAIL_FROM` (remitente con dominio verificado) y `BOX004_ORDER_EMAIL` (por defecto `santiago@box004.com`). Si faltan, los pedidos se guardan pero no se envían avisos. Si un aviso falla, el pedido sigue registrado: la lista del panel es la fuente de verdad. No se ha probado la entrega de correo real.

## Uso y conservación

- Para introducir pedidos antiguos: publicar las prendas correspondientes, abrir «Nuevo pedido manual» y anotar la fecha original en observaciones. La fecha de creación registrada será la fecha de entrada manual.
- Para retirar una prenda o talla: desactivarla. Los productos, variantes y pedidos no se borran desde el panel, para preservar el histórico.
- El CSV incluye una línea por prenda: «total pedido» e «importe pagado» se repiten por cada línea. Para sumar pedidos, agrupar por número de pedido o usar el resumen del panel.
- La exportación CSV neutraliza fórmulas introducidas en campos de texto.
- Las fotos son públicas; nunca subir documentación privada al catálogo.
- Planificar copias externas periódicas de base de datos y fotos. CSV conserva información operativa de los pedidos pero no sustituye una copia de seguridad completa.

## Verificación

Requiere Node 24 para los tests de TypeScript sin transpilar. Versiones de paquetes fijadas en `package.json` y lockfile.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

Las pruebas de base de datos usan Postgres en memoria (PGlite) con esquemas de Auth y Storage simulados: prueban SQL, RLS, roles, precios, descuentos, historial, idempotencia y límite de pedidos. No sustituyen la validación final de Supabase Auth, Storage y correo en el proyecto real.

`/api/health` devuelve `ready: true` únicamente si la conexión del servidor puede consultar productos. No muestra credenciales ni datos de clientes.

## Enlace público antiguo

`box-004-pedidos.vercel.app` pertenece al proyecto de la cuenta anterior. Publicar una aplicación nueva no transfiere ese dominio automáticamente. Para conservar los QR impresos habrá que actualizar el proyecto original o trasladarlo a la nueva cuenta, con acceso autorizado, después de verificar la nueva instalación.
