<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/nocoitam-logo-dark.svg">
    <img src="images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>Agentes en acción. Activos de TI en orden.</strong></p>

<p align="center">Gestión de activos de TI de código abierto · Construido sobre NocoBase</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/itam/"><strong>Pruébalo en línea</strong></a> · <a href="https://www.nocobase.com/es-ES/solution-itam/">Sitio web</a>
</p>

<p align="center">
  <a href="../README.MD">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ko-KR.md">한국어</a> · <a href="README.de-DE.md">Deutsch</a> · <a href="README.fr-FR.md">Français</a> · <strong>Español</strong> · <a href="README.pt-BR.md">Português</a> · <a href="README.ru-RU.md">Русский</a> · <a href="README.id-ID.md">Bahasa Indonesia</a> · <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

NocoITAM es un sistema de gestión de activos de TI de código abierto, construido sobre [NocoBase](https://www.nocobase.com). Las herramientas de ITAM tradicionales son registros que se llevan a mano. En NocoITAM, los agentes resuelven las diferencias con el MDM, equipan a las nuevas incorporaciones y revisan el stock y los activos sin uso antes de cada compra. Cada dispositivo, cada puesto y cada dólar quedan registrados.

https://github.com/user-attachments/assets/239facf2-a475-4592-b4c3-6c25e0f38a66

## Funcionalidades

- **Antes de cada compra, primero el stock.** Cuando un pedido se envía a aprobación, el asistente de aprobación comprueba si el stock o los dispositivos sin uso pueden cubrirlo, compara precios anteriores y solicitudes similares, y redacta una decisión y un comentario para quien aprueba.
- **Las incorporaciones, listas el primer día.** Cada departamento y cada puesto tiene su kit de incorporación. El plan de una incorporación tira del stock, los puestos sin uso, los pedidos en camino y lo que devuelven quienes se van; la IA elige los dispositivos y explica por qué, y los pedidos que faltan se crean con un clic.
- **Las salidas lo devuelven todo.** Los dispositivos, accesorios y puestos de quien se va se siguen hasta que vuelve todo, sus registros se traspasan y su acceso se desactiva el último día.
- **Las diferencias del MDM se convierten en un plan.** Microsoft Intune y Jamf Pro se sincronizan cada noche y se cruzan por número de serie. El agente clasifica lo que no cuadra: un usuario distinto va al responsable del dispositivo, un dispositivo no registrado a los gestores de activos y los casos dudosos a una persona.
- **Registro inteligente.** Pega o arrastra un presupuesto, una factura o un albarán: la IA rellena el pedido con sus líneas asociadas a tus modelos, revisa una entrega frente al pedido (cantidades, números de serie, garantía) y lee informes de reparación y certificados de baja. Las especificaciones de un modelo nuevo se completan desde la web.
- **3 agentes, y la IA donde se hace el trabajo.** El Custodio de Activos responde en cada página a partir de los registros que puedes ver y propone planes que confirmas en una tarjeta. El asistente de aprobación y el seguimiento del MDM trabajan en segundo plano, y la IA ayuda en 11 puntos, desde la recepción hasta comparar un presupuesto de reparación con sustituir el dispositivo. Los agentes sugieren; las personas deciden.
- **Licencias y suscripciones bajo control.** Por usuario, por dispositivo, de sitio o gratuitas, con puestos, claves y fechas de renovación. El cumplimiento se recalcula con cada cambio, y los puestos sobreasignados o sin uso se avisan antes de renovar.
- **Nada se escapa.** Las tareas empiezan con 14 comprobaciones de riesgo (garantías y suscripciones que vencen, puestos sin uso, stock bajo el mínimo, dispositivos sin inventariar desde hace un año) y siguen con el trabajo del equipo en columnas: aprobaciones, altas y bajas, pedidos, reparaciones, bajas de equipos e inventarios.
- **Un solo registro para todo lo que tiene TI.** Dispositivos, accesorios, consumibles, componentes y licencias de software, desde la compra, la recepción, la asignación y el préstamo hasta la reparación, el inventario y la baja, cada registro con su historial. 10 informes, importación y exportación CSV y búsqueda en todos los registros (⌘K / Ctrl+K).
- **Personalizable.** Escribe tus kits estándar, presupuestos y reglas de aprobación en lenguaje llano en la guía de negocio, y cada agente la sigue; el método de cada agente es una habilidad que puedes editar. El código es abierto, así que un agente de programación puede cambiar el resto.
- **Autoalojado.** Tus datos se quedan en tus servidores, con los modelos que elijas: DeepSeek, OpenAI, Claude, Gemini, Qwen y más. 12 idiomas de interfaz. Apache-2.0.

## Inicio rápido

¿Solo quieres echar un vistazo? [Pruébalo en línea](https://solutions.nocobase.com/itam/): entras con una cuenta de demostración y todos los datos son inventados.

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

Para producción, consulta [Despliegue](guide.md#deployment); para PostgreSQL y MySQL, consulta [Configuración](guide.md#configuration).

## Licencia

NocoITAM está construido sobre NocoBase y se publica bajo la licencia [Apache-2.0](../LICENSE).
