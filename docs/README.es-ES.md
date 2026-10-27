# NocoITAM

[English](../README.MD) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | Español | [Português](README.pt-BR.md) | [Русский](README.ru-RU.md) | [Bahasa Indonesia](README.id-ID.md) | [Tiếng Việt](README.vi-VN.md)

NocoITAM es un sistema de gestión de activos de TI de código abierto, construido sobre [NocoBase 3](https://www.nocobase.com). Las herramientas de ITAM tradicionales son registros que se llevan a mano. En NocoITAM, los agentes resuelven las diferencias con el MDM, equipan a las nuevas incorporaciones y revisan el stock y los activos sin uso antes de cada compra. Cada dispositivo, cada puesto y cada dólar quedan registrados.

https://github.com/user-attachments/assets/239facf2-a475-4592-b4c3-6c25e0f38a66

[Pruébalo en línea](https://solutions.nocobase.com/itam/) · [Sitio web](https://www.nocobase.com/es-ES/solution-itam/)

## Qué hace

- **Antes de cada compra, primero el stock.** Cuando un pedido se envía a aprobación, el asistente de aprobación comprueba si el stock o los dispositivos sin uso pueden cubrirlo, compara precios anteriores y solicitudes similares, y redacta una decisión y un comentario para quien aprueba.
- **Las incorporaciones, listas el primer día; las salidas lo devuelven todo.** El kit de incorporación se cruza de una vez con el stock y los puestos sin uso, y los pedidos que faltan se crean con un clic. Los dispositivos, accesorios y puestos de quien se va se siguen hasta que vuelve todo, y sus registros se traspasan.
- **Las diferencias del MDM se convierten en un plan.** Tras cada sincronización con Intune o Jamf Pro, el agente clasifica lo que no cuadra: un usuario distinto va al responsable del dispositivo, un dispositivo no registrado a los gestores de activos y los casos dudosos a una persona.
- **Un solo registro para todo lo que tiene TI.** Dispositivos, accesorios, consumibles, componentes y licencias de software, desde la compra, la recepción, la asignación y el préstamo hasta la reparación, el inventario y la baja, cada registro con su historial.
- **Un asistente en cada página.** El Custodio de Activos responde a partir de los registros que puedes ver y propone planes que tú confirmas. Cuando una tarea llega con un presupuesto, una factura o un albarán, la IA lo lee y rellena el formulario para que lo revises. Los agentes sugieren; las personas deciden.
- **Tus reglas, tu código.** Escribe tus kits estándar, presupuestos y reglas de aprobación en la guía de negocio, y cada agente la sigue. Pide a un agente de programación que cambie el propio código de ITAM. Código abierto, autoalojado y tuyo.

## Inicio rápido

### 1. Instalar

**Con un agente de programación.** La forma más fácil. Abre Claude Code, Codex o Cursor en la carpeta donde irá NocoITAM y dale esto:

```text
Instala NocoITAM desde https://github.com/nocobase/NocoITAM e inícialo, siguiendo el AGENTS.md y el README del repositorio.
```

**A mano.** Necesitas Node.js 24 o posterior y pnpm 10 (`corepack enable`). Los datos se guardan por defecto en un archivo SQLite; PostgreSQL y MySQL también funcionan.

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm dev
```

### 2. Iniciar sesión

Abre la dirección `Local:` que muestra `pnpm dev`, normalmente `http://127.0.0.1:13000/main/`, e inicia sesión como `nocobase` con la contraseña `admin123`.

### 3. Importar los datos de demostración

El banner de arriba los ofrece, o abre **Configuración → Datos de demostración**. Traen una empresa de unas cuarenta personas con sus dispositivos, stock y licencias, pedidos, reparaciones, inventarios y bajas, y plataformas Intune y Jamf de demostración; quítalos ahí cuando empieces de verdad.

### 4. Configurar un modelo de IA

Añade un servicio de modelos con su clave en **Equipo de agentes → Modelos**, como DeepSeek, OpenAI, Claude, Gemini o Qwen. El Custodio de Activos y los agentes lo necesitan; todo lo demás funciona sin él.

La [guía](guide.md) (en inglés) cubre los siguientes pasos, las cuentas de demostración, los roles, los agentes, la configuración (IA, MDM, bases de datos), el despliegue y el desarrollo.

## Licencia

[Apache License 2.0](../LICENSE)
