# Estado del Arte Tecnológico — Herramientas IA para Publicaciones Técnicas

## Fases estándar del proceso de desarrollo de publicaciones técnicas

---

### 1. Análisis y Preparación de la Source Data

**Descripción:** Análisis de planos, documentos de ingeniería, listas de partes, y generación de órdenes de trabajo con la source data aplicable adjunta.

**Herramientas actuales habituales:**
- Repositorios de datos tipo SharePoint (Excel, MS Word, etc.)
- PLM con información de diseño, planos y datos logísticos exportables por .CSV o por API REST (partes, consumibles, etc.)
- VPN para acceso remoto y Citrix (plataforma de virtualización que permite acceder de forma remota y segura a escritorios y aplicaciones corporativas)

**Herramientas específicas desarrolladas por los clientes usados por ellos mismos en exclusividad**
-  AIRBUS DS:
    - IDS (Integrated Data System): es la herramienta para gestionar los trabajos (está conectada a la CSDB Samanta). En esta herramienta se crean criterios y paquetes de trabajo (WO: Work Orders), se asocian los Data modules que aplican a cada WO para poder luego editarlas en PTC Arbortex que se encuentra embebido en Samanta Suite. También se le asocian las diferentes tasks a cada Data Module asociado, enlazando consumibles y otros elementos que deben incluirse al editar los DMs. También se asocian las ilustraciones a los DMs.
    - SIDIE: Es la base de datos de planos eléctricos, esta herramienta se usa para saber que planos tenemos que descargarnos posteriormente en SPRINT.
    - SPRINT: Es el repositorio de documentación de ingeniería, usada para descargar toda la documentación necesaria para realizar el trabajo, planos 2D y 3D, planos eléctricos, documentación de accesorios, MTA (Maintenance Task Analysis), Notas Técnicas (NT), etc.
    - ICD (Interface Control Document) / ICD Spares / ICD Accesory: se trata de un documento asociado a un accesorio del sistema que describe las distintas funcionalidades de los conectores eléctricos del mismo, y que es de utilidad para entender el funcionamiento del sistema.
    
**Herramientas con tecnología IA aplicable (estado del arte):**
- **Oxygen XML Editor** es el único editor XML comercial instalado en local que permite, sin crear código, indexar a su RAG un repositorio de documentos XML de referencia y la documentación técnica legacy volcada en un CCMS o CSDB. Además posee un MCP Client al que se le podría conectar un MCP Server con información de Source Data a la que acceder. Internamente, Oxygen también dispone de un MCP Server con funciones para la edición (agente IA Positron). Coste: 1.200 € licencia perpetua. Configurable con cualquier LLM mediante API Key. Dispone de SDK para desarrolladores.
- **Visual Studio Code** para proyectos con menor presupuesto: permite conectar carpetas locales de proyectos, tiene editor XML. Tiene un plugin para conectar Claude Code, Gemini o Codex de OpenAi embebido en Visual Studio Code.

**Tecnología IA que puede aportar valor:**
- VLM + LLM (multimodal) y librerías para OCR que pueden aportar en laa comprensión de PDFs e imágenes, planos, etc.
- Knowledge Graph
- RAG Léxico + RAG Semántico
- Tools / MCP Server / MCP Client para obtener fragmentos útiles externos a modo de Source Data para la posterior generación de contenido técnico

---

### 2. Autoría

**Descripción:** Redacción de contenido técnico (Data Modules / topics / etc.) conforme a los distintos estándares (S1000D, DITA, etc.).

**Herramientas actuales habituales:**
- **Herramientas para gestionar el contenido técnico**
    - **CCMS para DITA:** Bluestream, Ditatoo, Ixia, Heretto, RWS Tridion, ST4, etc.
    - **CSDB para S1000D:** Samanta, Xignal, EPS Eagle, Adam, Hico, Simplicio, etc.
    - **Gestión documental básica:** LogicalDoc (gratuito, funciones esenciales)
- **Herramientas para editar el contenido técnico**
    - **Edición no estructurada:** MS Word, Adobe FrameMaker
    - **Edición XML:** Xmetal, PTC Arbortext, Oxygen XML Editor
    - **Opciones gratuitas:** Notepad++, Visual Studio Code
    - Editores XML embebidos en CSDB de EPS o Xignal
- **Otros:** 
    - Hotspot Item Replacer Tool.html: herramienta propia de ATEXIS para transformar los numeros de Items en texto plano a hotspots XML S1000D encontrados en la ilustración. 
    SVG Viewer, SVG Wiring Drawings ó Markup Tool.html: herramienta propia para hacer anotaciones utilizando los planos eléctricos de wiring que vienen en el formato SVG.

**Herramientas con tecnología IA aplicable (estado del arte):**
- **Oxygen XML Editor** agente IA Positron con funciones de lecturar, escritura, MCP Server and MCPClient, SDK y plugin de conexión a CSDB / CCMS par habilitar RAG a contenido XML. Dispone de un plugin STE checker. Ver Anexo: funciones completas de Positron.
- **Visual Studio Code** con LLMs embebidos (Codex, Claude Code, Gemini) para proyectos de menor presupuesto
- **Xignal** tiene conector a LLMs y puede conectarse a PLMs para recuperar datos logísticos. Es exclusivo para S1000D.
- **Heretto CCMS** tiene integrado *Etto* como asistente IA para trabajar en DITA en su editor XML
- **IXIA CCMS** tiene *Syndicate* para gestión IA de publicaciones
- **RWS Tridion** tiene MCP conectado a Claude para ediciones y control de publicaciones desde el chat (también dispone de editor XML integrado)
- **ST4** tiene asistente IA (funciones por confirmar)
- **HyperSTE (Etteplan)** para proyectos con requisito STE (Standard Technical English), usa tecnología IA (pendiente de evaluación de la herramienta)

**Tecnología IA que puede aportar valor:**
- VLM + LLM (multimodal) para comprensión de imágenes y planos
- Knowledge Graph
- RAG Léxico + RAG Semántico
- Tools / MCP Server / MCP Client para editar, escribir y comentar contenido técnico
- ⚠️ Importante diferenciar LLM on-prem vs. on-cloud según restricciones de la auditoría

---

### 3. Ilustración

**Descripción:** Generación/adaptación de ilustraciones 2D/3D en formatos vectoriales o rasterizados, y definición de hotspots.

**Herramientas actuales habituales:**
- **Edición de ilustraciones:** Tech Draw, PTC Tech Illustrator, PTC Isodraw, Creo View, PTC Onshape, Product View, CATIA, Kister 3D ViewStation, Ms Paint
- **Otros:** Illustro (gestiona respositorio de ilustraciones pero solo para el cliente Airbus DS)


**Herramientas con tecnología IA aplicable (estado del arte):**
- **PTC** ha lanzado un chat conectado a Creo View y Onshape que permite modificar modelos y extraer vistas y anotaciones por lenguaje natural

**Tecnología IA que puede aportar valor:**
- VLM + LLM (multimodal)
- Chat y agentes con tools y MCPs para la edición

---

### 4. Validación

**Descripción:** QA técnico: conformidad con esquemas, consistencia y seguimiento de guías de estilo. También incluye validación técnica del contenido por parte de un SME (Subject Matter Expert)

**Herramientas actuales habituales:**
- Oxygen XML Editor (AI Positron) — único conocido con capacidad de crear comentarios, validarlos e incluirlos en el contenido tras aprobación humana, todo en la misma capa
- Schematron o BREX — utilizado para validaciones de esquemas XSD o DTD, y validaciones léxicas

**Herramientas con tecnología IA aplicable (estado del arte):**
- **Oxygen XML Editor (AI Positron)** — ídem al punto anterior

**Tecnología IA que puede aportar valor:**
- Misma tecnología que en Autoría
- Schematron + BREX + agentes de validación

---

### 5. Publicación & Dispatching

**Descripción:** Rendering a PDF / HTML5 / IETP y distribución a usuarios finales.

**Herramientas actuales habituales:**
- Templates (CSS, XSLT, XSL-FO) diseñadas al inicio del proyecto por los consultores de ATEXIS según los requisitos que demandan sus cliente. Habitualmente integradas en el motor de publicación del CCMS o CSDB

**Herramientas con tecnología IA aplicable (estado del arte):**
- **Visual Studio Code** con chat IA: para proyectos que requieren crear constantemente nuevas plantillas, permite generar XSLT a partir de capturas de pantalla
- **RWS Tridion** tiene un MCP Server que conecta su base de datos a Claude para generar PDFs por solicitud de chat

**Tecnología IA que puede aportar valor:**
- VLM + LLM (multimodal)
- App con Chatbot IA para generar PDFs, IETP, etc. en base a argumentos configurables (por ejemplo, aplicabilidades), y plantillas diseñadas en Word, imágenes, etc.

---

## Anexo 1: Funciones del agente Oxygen XML AI Positron

### Indexación
- Oxygen hace indexación textual clásica, no embeddings semánticos para IA generativa. Sin embargo, Oxygen ya entiende estructura XML/DITA, conoce mapas, relaciones, metadata, keys, reuse, y contextos. Esto es oro para un RAG industrial porque se puede hacer retrieval por topic, por applicability, por metadata, por product variant, por ATA chapter, por information type, etc. Y ahí es donde un RAG basado en DITA puede ponerse sin alucinar.

### Uso de Oxygen RAG
Oxygen AI Positron ya tiene una arquitectura preparada para usar RAGs, pero hay una diferencia importante:
- El RAG interno de Oxygen funciona sobre el proyecto S1000D/DITA/XML abierto y sobre los datos del CCMS conectado (también con estructura S1000D/DITA/XML).
- Un RAG externo no se conecta automáticamente, requiere de MCP Server, y conectarlo al MCP Client de Oxygen
Eso significa que el LLM obtiene contexto directamente del proyecto abierto en Oxygen, no desde tu vector DB externa.

### MCP Client
- MCP Client to be connected to other MCP Servers to get more data or info througout LLM API connector and AI Oxygen Positron. Se usaría para traer información de un RAG + MCP Server que esté pre-analizada.

### Herramientas disponibles dentro del MCP Server de Oxygen 

| Función | Descripción |
|---|---|
| `find_reusable_components` | Encontrar componentes reutilizables |
| `get_dita_keyrefs` | Obtener referencias de clave DITA |
| `get_ditamap_structure` | Obtener estructura del DITA map |
| `get_document_content` | Leer documento |
| `get_schematron_components` | Info de componentes Schematron del documento actual e incluidos |
| `get_xsd_components` | Info de componentes XML Schema del documento actual e incluidos |
| `get_xsl_components` | Info de componentes XSLT del documento actual e importados |
| `grep_project` | Buscar coincidencias exactas en el proyecto |
| `list_dir` | Listar archivos en carpeta |
| `resolve_dita_reference` | Resolver referencia DITA |
| `search_project_resources` | Buscar en recursos del proyecto |
| `add_dita_reference_to_ditamap` | Añadir referencia al DITA map |
| `copy_move_rename_path` | Copiar, mover o renombrar |
| `edit_document` | Escribir documento |
| `refactor_xml` | Refactorizar XML con operación |
| `refactor_xml_with_xslt` | Refactorizar XML con XSLT |
| `save_document` | Guardar documento |

### Tareas disponibles en AI Positron

| Categoría | Acción |
|---|---|
| **Intelligent Agents** | Generate agent instructions, Create Topics, Expand Draft, Split Data Modules, Fix Validation Problems |
| **Accessibility** | Generate Image Alternate Text |
| **Content Generation** | Generate Documentation Draft, New S1000D Data Module, Update Content Based on Images, Short Description, Index Terms, Formula/Equation |
| **Rewrite** | Correct Grammar, Improve Readability, Use Active Voice, Improve Structure, Itemize, Join Items |
| **Review** | Proofread, Resolve Comments |
| **Overview** | Answer Questions, Generate Questions, Summarize, Readability |
| **Translation** | English / French / German / Japanese / Other |
| **Reuse** | Product Names, Parts, CIR Repository, Component, Applicabilities, Acronym |
| **Conversion** | Analyze and update Data Modules, Convert to Descriptive / Procedural / IPD / Troubleshooting, etc. |
| **Marketing** | Release Notes, Marketing Post, Improve SEO, Pain-Agitate-Solution, Features-Advantages-Benefits |
| **Others** | Custom Categories según necesidades del proyecto |


### Oxygen SDK

#### Casos de Uso Principales del SDK
1. Plugins para Oxygen XML (standalone) Puedes crear plugins con distintos tipos de extensiones. Cada uno cubre una necesidad diferente:
    - Workspace Access Plugin — Añadir acciones al menú principal y barras de herramientas, crear vistas personalizadas, personalizar la interfaz general. También hay una versión JavaScript-based.
    - Author Stylesheet Plugin — Añadir hojas de estilo CSS/LESS para cambiar cómo se renderizan los elementos en el modo Author.
    - Additional Framework Plugin — Añadir un nuevo framework directamente desde el plugin y personalizar frameworks, o extender la funcionalidad Java de un framework existente.
    - Components Validation Plugin — Habilitar o deshabilitar menús, barras de herramientas y otros componentes de la interfaz dinámicamente.
    - Option Page Plugin — Añadir páginas de preferencias personalizadas en el menú de opciones de Oxygen.
    - Custom Protocol Plugin — Implementar un protocolo personalizado para recuperar y almacenar documentos (por ejemplo, conectar con tu propio CMS o repositorio).
    - Resource Locking Plugin — Gestionar el bloqueo de recursos en tu protocolo personalizado.
    - Styles Filter Plugin — Modificar dinámicamente los estilos CSS que renderizan los elementos en el modo Author.
    - Targeted URL Stream Handler Plugin — Imponer manejadores de URL personalizados para URLs específicas.
    - XML Refactoring Operations Plugin — Añadir operaciones de refactorización XML personalizadas.
    - XSLT Transformer Plugin — Integrar un motor XSLT externo.
    - Saxon XSLT Transformer Plugin — Integrar una versión específica de Saxon como motor XSLT.
    - XQuery Transformer Plugin — Integrar un motor XQuery externo.
    - Validator Plugin — Añadir un motor de validación externo personalizado.
    - Additional XProc Engine Plugin — Integrar un motor XProc externo.
    - Open Redirect Plugin — Abrir múltiples archivos con una sola acción.
    - Lock Handler Plugin — Gestionar bloqueos de recursos desde un protocolo específico.
    - Trusted Hosts Plugin — Permitir o rechazar automáticamente conexiones remotas.
    - Contribute Additional Languages Plugin — Añadir nuevos idiomas de traducción a la interfaz de Oxygen.
    - Contribute External DITA-OT Plugin — Integrar una distribución externa de DITA-OT.
    - Plugins para modo Text — Extensiones diseñadas específicamente para el modo de edición de texto.

2. Casos de uso específicos vía API (Author API). La API permite hacer cosas muy concretas dentro del editor, como: añadir acciones al menú contextual, Auto-generar IDs al abrir o crear documentos, Imponer opciones personalizadas a los autores, Modificar el contenido XML al abrir o al guardar, Múltiples modos de renderizado para el mismo documento, Abrir documentos desde otra aplicación mediante protocolo personalizado, Estilos de renderizado personalizados para referencias de entidades, comentarios o Pis, etc

3. Embeber Oxygen en tu propia aplicación
- Author Component (desktop) — Integras el motor de edición de Oxygen en tu app Java Swing. Perfecto para crear tu propio editor XML de escritorio con todas las capacidades de Oxygen por debajo.
- Web Author Component (web) — Despliegas el componente en un servidor y añades edición XML avanzada a tu aplicación web.

---

## Anexo 2: PTC Arbortext SDK
A pesar de que PTC arbortext no tiene agente IA integrada de momento, aunque sí se espera su desarrollo próximamente, dispone de capacidades de Extensión y Desarrollo

### APIs y Object Model
- AOM (Arbortext Object Model): acceso programático a documentos, cursor, validación, publicación, menús, eventos y objetos internos
- DOM support: manipulación del árbol XML via Document Object Model estándar
- COM/ActiveX: exposición de capacidades via Component Object Model, integrable desde apps externas Windows
- Acceso a la mayoría de funcionalidades internas del editor via API
### Lenguajes de programación soportados
ACL (nativo), JavaScript, JScript, Java, C/C++, Visual Basic, VBScript, PerlScript
### Personalización de UI
- Diálogos personalizados via XML config + ActiveX embebido
- Toolbars y menús propios
- Paneles HTML/JS embebibles (WebView)
- Comandos custom
### Extensiones de comportamiento
- Scripts ACL para automatización de tareas
- Validaciones Schematron y BREX integradas
- Transformaciones XSL/XSLT
- Eventos y hooks sobre acciones del editor
- Workflows de authoring modificables
- Java Client SDK de la Arbortext Publishing Engine. Su función es una sola y muy concreta: permitir que aplicaciones Java externas se comuniquen con el servidor de publicación de Arbortext (Arbortext Publishing Engine) para enviarle documentos y recibir el output publicado. Su alcance es muy limitado comparado con Oxygen, además, el SDK es completamente opcional ya que como el servidor es HTTP, podrías hacer lo mismo con las librerías de red estándar de Java sin usar el SDK.
### Integración con ecosistema PTC
- Windchill: lanzar Arbortext directamente desde el PLM, gestión de check-in/out
- Arbortext IsoView / Creo View: visualización integrada
- Publishing Engine: versión headless/servidor para pipelines automatizados sin UI
### Integración externa
- COM embedding: hospedar Arbortext dentro de otra app Windows
- Lanzar como proceso externo con parámetros
- REST/HTTP desde paneles JS internos hacia backends externos
- Conexión a CCMS (Windchill, Tridion Docs, Ixiasoft) via sus APIs REST
- Posibilidad de conectar Python, APIs REST, RAG, MCP Servers via capa intermedia
### Despliegue
- Directorio de despliegue enterprise centralizado

---

## Anexo 3: Herramientas y Aceleradores propios de ATEXIS

Herramientas y aceleradores **propiedad de ATEXIS** que pueden usarse gratuitamente si cubren alguna necesidad del cliente de forma eficiente, o cuyo código puede reutilizarse para construir aplicaciones adaptadas a las necesidades del cliente.

| Aplicación | Descripción y tecnología |
|---|---|
| **A³ Linguo** | Traducción técnica (Excel, PowerPoint, Word) con IA en una web app on-prem. OCR, predefined dictionary mapping, and RAG-based. On-prem. Rendimiento limitado. |
| **Luminai / A³ DocInsight** | Chat con tus documentos (PDF, DOCX, PPTX, etc.). Un "copiloto" web privado y offline que permite hacer preguntas sobre tus propios documentos (RAG + OCR) sin usar APIs externas. Ideal para extraer información de fuentes internas de forma rápida y segura. On-prem. Rendimiento limitado. |
| **A³ Compass** | Solución para catalogar, buscar y reutilizar activos de conocimiento organizacional (proyectos, herramientas, documentos mediante RAG) que de otro modo serían difíciles de gestionar con métodos tradicionales. On-prem. Pendiente de validación. |
| **A³ TestGen** | Generación de pruebas de software. Mejora la preparación de datos y la automatización de pruebas (uso de RAG). On-prem. No aplica a proyectos de publicaciones técnicas. |
| **A³ DocShaper** | Estandarización de documentos. Transforma documentos de cualquier formato a una estructura unificada basada en una plantilla dada (PDF, HTML, Word). On-prem. Pendiente de validación. |
| **Clayverest** | Gestión de proyectos SaaS o On-prem. Management of actions, risks, governance, decisions, costs and dependancies. No aplica a proyectos de publicaciones técnicas. |
| **Glosa** | Captura audio y hace transcripción y traducción en tiempo real. Útil para reuniones, medios y tecnologías de asistencia. No aplica a proyectos de publicaciones técnicas. On-prem. |
| **Edge AI Suite** | IA embebida en dispositivos on -prem. Optimizar modelos de machine learning y deep learning en microcontroladores y sensores inteligentes de ST. No aplica a proyectos de publicaciones técnicas. |
| **Document AI** | Procesamiento inteligente de documentos. Herramienta de Mistral AI para extracción automatizada de texto, escritura a mano, tablas e imágenes de documentos con más del 99% de precisión. Puede procesar hasta 2.000 páginas por minuto en una sola GPU. On-prem. Pendiente de validación. |
| **CogniSense** | Análisis de datos mediante chat. Permite hacer preguntas sobre datos de Excel y generar reportes, gráficos e insights de forma conversacional e interactiva, automatizando el análisis manual de datos estructurados. Pendiente de validación. |
| **iCare** | Visión por computadora para cuidado de mayores. No aplica a proyectos de publicaciones técnicas. |
| **Alfred** | Chatbot con RAG híbrido para cargar documentos y hacerle preguntas. Rendimiento limitado. |
| **Vexa** | Recoge documentos de múltiples formatos (XML, PPT, Excel, Word, etc.) y los traduce al idioma requerido. Permite agregar diccionario de traducción. No funciona como chat. |
| **Amadeus** | OCR + Vector Embeddings + Hybrid RAG con conexión por API Key a un LLM. Pendiente de validación. |
| **Opsira** | OCR con conexión por API Key a un LLM. |
| **Prism** | Framework multi-LLM en desarrollo basado en Azure AI. Permite utilizar cualquier LLM on-cloud con nivel de seguridad elevado. |
| **Volvo TSC and Data Model** | RAG + Chatbot con conexión por API Key a un LLM. Permite consultas y devuelve texto. Misma tecnología base que ATEXIS Content Generator. |
| **Daisei** | RAG conectado al LLM de Daisei (empresa A-D-S) como chatbot para resolver preguntas a usuarios. Solo válido para A-D-S. |
| **AXA IM** | LLM + System Prompt inicial. Chatbot especializado en procesar Work Orders para el departamento de finanzas. |
| **Infocode Prediction** | LLM + System Prompt inicial. Predice el infocode de un Data Module S1000D. |
| **ATEXIS Content Generator** | RAG + Chatbot con conexión por API Key a un LLM. Permite consultas y devuelve texto. |
| **ATEXIS Internal – Specialised Chatbots** | RAG + Chatbot con conexión por API Key a un LLM. Misma tecnología base que ATEXIS Content Generator. |
| **FTM Agent** | RAG + System Prompt + LLM con Chatbot. Acepta archivos FTM (documentos técnicos ferroviarios en Excel), aplica reglas de validación basadas en experiencia experta y devuelve errores detectados. |
| **KleamPy** | RAG híbrido + Knowledge Graph + MCP Server + Chatbot con conexión por API Key a cualquier LLM. Muy depurado en lectura de documentos, chunking y embeddings. Alta velocidad de procesamiento. Puede generar documentos de salida mediante tools. ⚠️ Adecuado para POCs y demostraciones. No recomendado para despliegue en entorno productivo de cliente — usar KM RAG en su lugar. |
| **PDF Reviewer** | OCR + cargador de reglas y checklist + Esta herramienta lee el PDF mediante OCR, verifica el texto según las reglas y propone cambios dentro del propio PDF marcando el texto que necesita ser modificado. SQLlite + Mistral LLM + librerías python PDF |
| **BRDP Manager** | Aplicación para gestionar el ciclo de vida completo de los Business Rule Decision Points (BRDPs) en proyectos de publicaciones técnicas basados en DITA o S1000D. Incluye gestión del repositorio de BRDPs y del estado de validación con historial de cambios (Imagen 3), función AI Extract para la extracción automática de BRDPs a partir de archivos subidos por el usuario, como documentos .docx o .pdf (Style Guide, documento BREX u otros), y generación de BREX / Schematron a partir de los BRDPs validados (Schematron, S1000D 4.2 u otra issue), listos para descargar. Además, valida que el XML esté bien formado y genera el BREXDoc en HTML. También incorpora un chatbot asistente de BRDP que, utilizando el contexto de un BRDP específico, sugiere propuestas de mejora estructuradas y permite aplicarlas directamente mediante un botón. Frontend with a localstore. Localstore (sin backend) + Javascript + CSS + selección Multi-LLM |
| **KM RAG** | Es el RAG más potente de la empresa y cuenta con la arquitectura más avanzada, preparado para reutilizarse en futuras aplicaciones. Además, está alojado en el servidor interno más potente, reduciendo considerablemente la latencia. El RAG dispone de opciones configurables para optimizar el retrieval, así como graders y métricas de recuperación para su validación. Dispone de chat. Frontend + Backend + pgVector + RAG + LLM connector. ✅ Herramienta de producción recomendada para despliegue on-prem en entorno de cliente. Soporta instalación en infraestructura local del cliente con todos los requisitos de soberanía de datos. Usar KM RAG (en lugar de KleamPy) en cualquier proyecto productivo con requisitos de calidad, escalabilidad o cumplimiento normativo. |
| **Confidentiality Manager** | Usa el KM RAG anterior para realizar embeddings de documentación y clasificar los documentos mediante un LLM on-premise, asignándolos por nivel de confidencialidad: C0, C1, C2 y C3. Este filtro permite definir con qué documentos se puede o no trabajar en un proyecto. Frontend + Backend + pgVector + RAG + LLM connector. |

**Detalle de los niveles de confidencialidad que se tienen en cuenta en los proyectos de ATEXIS:**
- "C0" (Public): Basic security. Public information with low impact if disclosed. Data intended for publication.
- "C1" (Internal): Basic security. Internal use only with moderate impact if disclosed. Default for most internal documents.
- "C2" (Restricted): Higher level security. Controls required. High impact on business if disclosed. Recommendations C1 should also be applied.
- "C3" (Confidential): Maximum security. Critical impact on business if disclosed. Documents at this level are QUARANTINED and never stored. C3 triggers: financial cost >10% contract turnover, fines, jail sentences, total loss of client confidence, national media impact.
Otras reglas y clasificaciones que realiza:
- "none" — No export control. Pure European content, no US-origin technology.
- "EAR" — US Export Administration Regulations. Dual-use items with both civilian and military applications. ECCN numbers present.
- "ITAR" — International Traffic in Arms Regulations. US defense articles, USML categories, military-specific technical data.
- "public" — Unclassified. No national security implications. Civilian content, public standards (EASA, S1000D), commercial aerospace.
- "restricted" — Restricted distribution. Defense contractor internal documentation. No formal classification marking but related to military programs. Equivalent to: FR "Diffusion Restreinte", ES "Difusión Limitada", NATO Restricted.
- "confidential" — Confidential defense. Contains military program details, defense procurement strategies, capability assessments. Equivalent to: NATO Confidential, ES "Confidencial".
- "secret" — Secret defense. Specific weapons systems, operational plans, classified technical data. Equivalent to: FR "Secret", NATO Secret. Very rare in ATEXIS context.
- No Personal Data (none): Sin información que identifique o pueda identificar a una persona física.
- Datos Personales (personal, Art. 4): Incluye nombres, correos electrónicos, números de teléfono, identificaciones de empleado, fotos y direcciones IP. Según Alten, abarca seis categorías: identificación, familiar, profesional, TI, financiera y ubicación.
- Datos Sensibles (sensitive, Art. 9): Categorías especiales como datos de salud o médicos, biométricos, raciales o étnicos, políticos, religiosos, afiliación sindical, orientación sexual, genéticos y penales.
- Open (open): Sin restricciones de propiedad intelectual o contractuales. Incluye plantillas internas y estándares públicos.
- Acuerdo de No Divulgación (NDA): Acuerdo de confidencialidad en vigor. Aplica principalmente a trabajos específicos del cliente, con restricciones de uso compartido limitadas a las partes firmantes del NDA.
- Información Propietaria (proprietary): Secretos comerciales, tecnología patentada o marcada explícitamente como "Propietaria". Sujeta al nivel más alto de restricción contractual.
