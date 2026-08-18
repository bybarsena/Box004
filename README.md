# Box 004 · Plataforma de pedidos

Mini plataforma responsive para gestionar reservas de equipación de Box 004. Permite combinar producto, modelo, talla, color y cantidad; enviar pedidos con varios artículos; y administrar catálogo, variantes, precios y estados sin tocar código.

## Arquitectura elegida

- **Next.js 16 + Vercel** para interfaz y endpoint transaccional. Es la opción más simple y robusta aquí: despliegue nativo, funciones Node para Resend y previews automáticas al conectar GitHub.
- **Supabase** para Postgres, autenticación y RLS. No se expone ninguna clave privilegiada; el alta pública de pedidos pasa por una función SQL validada.
- **Resend** para el aviso por email. El pedido se guarda aunque Resend no esté configurado, para no perder solicitudes.
- **Cloudflare** no se usa en esta primera versión porque duplicaría hosting y configuración. Puede añadirse después para dominio, DNS o WAF sin cambiar la app.
- **Canva** no fue necesario: la identidad oscura, blanca y amarillo/naranja está implementada directamente en la interfaz.

## Puesta en marcha

1. Instala dependencias con `pnpm install` y copia `.env.example` a `.env.local`.
2. Aplica `supabase/migrations/20260818120000_box004_initial.sql` al proyecto Supabase.
3. Crea un usuario en **Supabase > Authentication > Users** y ejecuta `supabase/admin-bootstrap.sql` sustituyendo el email. No hay registro público de administradores.
4. Ejecuta `pnpm dev`.

## Variables de entorno

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL pública del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | Clave pública; segura en navegador gracias a RLS |
| `RESEND_API_KEY` | Para email | Secreto de Resend, solo servidor |
| `BOX004_ORDER_EMAIL` | Para email | Destinatario real de Box 004 |
| `BOX004_EMAIL_FROM` | Para email | Remitente de un dominio verificado en Resend |

Durante el despliegue inicial las coordenadas públicas del proyecto conectado se incluyen como fallback. Define las variables en Vercel para poder rotarlas sin desplegar código.

## Email pendiente de datos reales

No se inventan direcciones ni secretos. Hasta configurar las tres variables de Resend, los pedidos quedan registrados y visibles en administración, pero no se envía el aviso. Instala Resend desde Vercel Marketplace, verifica un dominio y añade el correo real de Box 004.

## Estado de esta entrega

- Supabase: proyecto `sqkhysngsxiwadqzztwd`, dos migraciones aplicadas y verificadas.
- Vercel: despliegue creado en `https://box-004-pedidos-smartrainingprogram-7206s-projects.vercel.app`. La cuenta tiene protección SSO activa, por lo que hay que desactivarla para acceso público.
- GitHub: el repositorio local está preparado en la rama `main`. La cuenta conectada no contiene repositorios y el conector no permite crear uno; crea un repositorio vacío y añade su URL como `origin` para publicar.
- Administrador: falta crear el primer usuario de Supabase Auth y ejecutar `supabase/admin-bootstrap.sql` con su email real.
- Email: faltan `RESEND_API_KEY`, `BOX004_ORDER_EMAIL` y `BOX004_EMAIL_FROM` con datos reales.

## Seguridad

- RLS habilitado en todas las tablas públicas.
- Catálogo activo visible de forma anónima; catálogo completo y pedidos solo para administradores.
- Pedidos públicos mediante `create_order`, que valida límites y vuelve a leer producto y precio desde la base de datos.
- Productos y variantes se desactivan sin borrar el histórico.
- La clave secreta de Supabase no se utiliza ni se necesita.

## Verificación

Ejecuta `pnpm lint` y `pnpm build`. Después comprueba: catálogo, pedido con varias líneas, acceso denegado a un usuario no administrador, CRUD de catálogo y las cuatro transiciones de estado.

