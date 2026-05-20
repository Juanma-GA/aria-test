# Sub-casos de Uso IA para los proyectos de desarrollo de Publicaciones Técnicas

Catálogo de sub-casos de uso IA aplicables al proceso de producción de publicaciones técnicas. Clasificados por fase del proceso productivo. 

---

## Análisis y Preparación de la Source Data

### CU-01 · Análisis de Impacto de Cambios en Documentación 
Detecta automáticamente qué documentación técnica se ve afectada por cada cambio técnico de diseño, trazando el impacto sobre la documentación existente a partir de los datos fuente. Elimina las revisiones manuales y permite actuar con rapidez y precisión ante cualquier actualización.

**Solución externa desplegable:** PTC Windchill MCP Server + LLM con RAG vía Oxygen alimentado con documentación existente (CCMS/CSDB) + Agente que cruza cambios detectados con DMs afectados y genera informe de impacto.

**Solución a desarrollar:** RAG multimodal (texto y visión) para recuperar datos de herramienta de diseño y documentación existente + Agente/orquestador que lee la Change Request y lanza la tarea al LLM + LLM que genera el informe de impacto y cruza datos de cambio con DMs afectados.

---

### CU-02 · Generación Automática de Órdenes de Trabajo 
Genera órdenes de trabajo detalladas y precisas a partir de los datos fuente y de los análisis de impacto, incluyendo descripción de cambios. Reduce el tiempo de elaboración y minimiza errores de transcripción.

**Solución externa desplegable:** PTC Windchill Chatbot para acceder a datos de diseño + CCMS IXIA con módulo Syndicate para gestión y emisión de Work Orders + LLM que genera contenido estructurado de la WO a partir del análisis de impacto.

**Solución a desarrollar:** MCP Server / Function Calling para recibir trigger de la CR desde el sistema de diseño + LLM que genera el contenido estructurado de la Work Order + MCP Server / Function Calling para registrar la nueva WO en el CCMS/CSDB.

---

### CU-03 · Detección y Alerta de Documentos Técnicos Obsoletos 
Garantiza que los equipos trabajen siempre con documentación vigente y detecta documentos obsoletos que requieren actualización.

**Solución a desarrollar:** RAG para recuperar WOs con descripción y datos adjuntos + RAG para acceder a DMs y PMs del repositorio + Agente/orquestador que lanza el análisis a demanda + LLM que cruza ambas fuentes e identifica módulos que requieren actualización.

---

### CU-04 · Centralización e Ingesta de Documentos en Repositorio IA 
Recopila y centraliza automáticamente documentos de múltiples fuentes (SharePoint, PDF, Word, Excel, etc.) en un repositorio unificado, disponible para su uso por los modelos de IA. Elimina búsquedas dispersas y sienta la base para cualquier caso de uso de IA documental.

**Solución a desarrollar:** RAG global para recuperación de toda la documentación centralizada + MCP Server / Function Calling para gestión de rutas de repositorios e ingesta de nuevos documentos + Agente/orquestador que lanza la tarea de inclusión de nuevos documentos en el RAG + LLM para validar e identificar documentos aptos para incorporar al repositorio.

---

## Autoría

### CU-05 · Generación de Borradores Técnicos a partir de Source Data
Genera borradores de documentación técnica conformes a normativa (S1000D, DITA, etc.) a partir de datos fuente estructurados o no estructurados. Acelera la fase de autoría y reduce el tiempo dedicado a la creación de contenido desde cero.

**Solución externa desplegable:** Oxygen RAG alimentado con Source Data + Oxygen AI Positron entrenado en normativa XML con BREX cargado + Oxygen Agent y MCP Server para generar el borrador del DM conforme al estándar.

**Solución a desarrollar:** RAG para acceder a plantillas XSD/DTD, modelos de referencia, BREX y normativa aplicable + RAG para alimentarse con Source Data + Function Calling para determinar el tipo de transformación requerida + Agente/orquestador que sincroniza el workflow + LLM entrenado en normativa XML que genera el borrador.

---

### CU-06 · Asistente de Mejora de Calidad Documental
Analiza documentos técnicos y propone mejoras de estructura, legibilidad, voz activa, vocabulario controlado, términos de índice y gramática. Eleva la calidad documental de forma sistemática y auditable.

**Solución externa desplegable:** Oxygen Agent con acceso a funciones de mejora + Oxygen RAG alimentado con documentos del CCMS/CSDB como referencia de estilo y normativa + Oxygen AI Positron entrenado en normativa XML y reglas BREX.

**Solución a desarrollar:** RAG alimentado con documentación del CCMS/CSDB como referencia + Agente/orquestador que ejecuta tareas de mejora + LLM entrenado en normativa XML que genera sugerencias + Function calling mediante prompts para cada acción de mejora.

---

### CU-07 · Traducción Técnica con Preservación de Normativa y Estructura XML
Traduce documentación técnica respetando la jerarquía XML, las reglas BREX y las restricciones normativas (preservando el DMC sin traducir). Garantiza documentación multilingüe conforme y coherente.

**Solución externa desplegable:** Oxygen Agent para selección de idioma y traducción + Oxygen RAG alimentado con traducciones existentes como memoria de traducción + Oxygen AI Positron entrenado en normativa XML y vocabulario controlado + MCP Server para auto-edición de documentos. También: Vexa (ATX) para traducción masiva con diccionario personalizado.

**Solución a desarrollar:** RAG alimentado con documentación existente como memoria de traducción + Agente/orquestador que ejecuta tareas de traducción respetando jerarquía XML y restricciones BREX + LLM entrenado en normativa XML que genera la traducción con vocabulario controlado.

---

### CU-08 · Generación de Plantillas de Documentos Técnicos
Genera prototipos de plantillas para nuevos tipos de documentos técnicos (Service Bulletins, documentos con estructuras customizadas) basándose en los estándares aplicables. Acelera la estandarización y reduce el esfuerzo de configuración inicial en nuevos proyectos.

**Solución externa desplegable:** Oxygen Agent con acceso a función de mejora de estructura para generar el esqueleto de la plantilla + Oxygen RAG alimentado con documentos base y normativa + Oxygen AI Positron entrenado en normativa XML con BREX cargado + MCP Server para auto-edición de plantillas.

**Solución a desarrollar:** RAG alimentado con documentos base y normativa del estándar requerido + Agente/orquestador que ejecuta la generación de la plantilla + LLM entrenado en normativa XML que genera la estructura.

---

### CU-09 · Extracción y Sincronización de Datos Logísticos en Repositorios de Documentación Técnica
Interpreta borradores de documentos técnicos y extrae automáticamente referencias a piezas, consumibles, herramientas, zonas, advertencias y configuraciones, sincronizándolas con las bases de datos logísticas oficiales. Reduce errores de coherencia y elimina la introducción manual de datos.

**Solución externa desplegable:** Oxygen RAG con acceso al CCMS/CSDB + Oxygen Agent con acceso a función Component + Oxygen AI Positron entrenado en normativa XML + Function Calling o MCP Server para sincronizar datos con repositorios logísticos.

**Solución a desarrollar:** RAG alimentado con documentación logística del CCMS/CSDB + Agente/orquestador con tools que ejecuta la búsqueda de componentes en el borrador y realiza el matching con registros del repositorio logístico + LLM entrenado en normativa XML que sincroniza y valida todas las fuentes.

---

### CU-10 · Enriquecimiento de Documentos con Metadatos Semánticos
Genera y añade metadatos semánticos contextuales a los documentos técnicos, mejorando la capacidad de los modelos de IA para recuperar, comprender y generar contenido relevante en iteraciones futuras. Reduce alucinaciones y mejora la precisión de los resultados.

**Solución externa desplegable:** Oxygen RAG con acceso al CCMS/CSDB + Oxygen Agent con acceso a función Component + Oxygen AI Positron entrenado en normativa XML + Function Calling o MCP Server para escribir los nuevos metadatos en los documentos.

**Solución a desarrollar:** RAG alimentado con documentación técnica del CCMS/CSDB como referencia de contexto semántico + Agente/orquestador que detecta metadatos faltantes o incompletos + LLM entrenado en normativa XML que propone los nuevos metadatos + MCP Server / Function Calling para escribir los metadatos generados.

---

### CU-11 · Vinculación Automática de Ilustraciones a Contenido Técnico
Vincula dinámicamente los hotspots de ilustraciones con el contenido de los documentos técnicos correspondientes, manteniendo la trazabilidad entre contenido gráfico y textual. Reduce el trabajo manual de asociación y mejora la navegabilidad de los manuales técnicos.

**Solución a desarrollar:** VLM para interpretar la ilustración e identificar los elementos representados + MCP Server / Function Calling para leer el DM afectado y escribir los vínculos resultantes + LLM para comprender el contenido textual del documento y resolver la asociación semántica ilustración-módulo.

---

### CU-12 · Detección y Eliminación de Contenido Duplicado
Identifica automáticamente contenido duplicado o redundante en la documentación técnica y facilita su eliminación, optimizando el repositorio y garantizando la unicidad de la fuente de verdad.

**Solución externa desplegable:** A. RWS Tridion CCMS con MCP Server conectado a Claude: detecta duplicaciones dentro del CCMS y publica los resultados en el chat. B. Oxygen MCP Server conectado al CCMS/CSDB y Agent para la detección de duplicados sobre DMs o topics seleccionados.

**Solución a desarrollar:** MCP Server con funciones para seleccionar un conjunto de documentos del CCMS/CSDB + LLM que analiza el contenido semántico e identifica duplicidades y redundancias entre los documentos seleccionados.

---

### CU-13 · Aplicación Automática de Reglas STE
Aplica las reglas del Simplified Technical English (STE) sobre el contenido técnico, estandarizando la redacción y reduciendo ambigüedades.

**Solución externa desplegable:** A. HyperSTE (Etteplan): motor lingüístico determinista basado en 65 reglas ASD-STE100, integrable con Oxygen, Adobe FM y Arbortext mediante AI Guardrails para saber qué frase viola qué regla exacta como contexto/prompt para enviar al LLM, y pedirle que proponga una reescritura que cumpla esa regla. B. GPSL: LLM fine-tuned específicamente para validación STE.

**Solución a desarrollar:** A. Motor lingüístico determinista + AI Guardrails vía LLM. B. LLM fine-tuned específicamente para validación y corrección STE.

---

## Ilustración

### CU-14 · Análisis Semántico de Modelos 3D para Procedimientos Técnicos
Examina modelos 3D (STEP, JT) para identificar información relevante para la generación de contenido: secuencias de desmontaje, restricciones de zona y prerequisitos operativos. Mejora la fiabilidad y completitud de los procedimientos generados.

**Solución a desarrollar:** LLM multimodal para interpretar la geometría y metadatos del modelo 3D + Ontología de mantenimiento (Knowledge Graph) que correlaciona metadatos 3D con datos S1000D + Agente/orquestador que gestiona el workflow de análisis y generación de condiciones de acceso.

---

### CU-15 · Edición Asistida de Ilustraciones y Modelos 3D
Facilita la modificación de ilustraciones y modelos 3D existentes preservando su integridad estructural y visual. Reduce el tiempo de edición manual en tareas de actualización gráfica.

**Solución externa desplegable:** PTC Creo View o Onshape con MCP Server para acceder y modificar los modelos 3D existentes + Agente que interpreta la solicitud de modificación en lenguaje natural y la traduce en operaciones sobre el modelo + LLM multimodal para validar visualmente el resultado.

**Solución a desarrollar:** LLM multimodal o VLM para interpretar la ilustración o modelo 3D existente + MCP Server / Function Calling para acceder a la información STEP y a los ficheros de ilustración + Agente IA que gestiona el workflow de interpretación y ejecuta las solicitudes de modificación.

---

## Validación

### CU-16 · Validación Automática de Reglas de Autoría
Verifica automáticamente que los documentos técnicos cumplan las reglas de autoría del estándar aplicable (S1000D, DITA, STE): estructura, BREX, vocabulario, voz activa, términos de índice y gramática. Detecta incumplimientos antes de la publicación.

**Solución externa desplegable:** Oxygen Agent con acceso a funciones de validación + Oxygen RAG alimentado con normativa aplicable y reglas BREX del proyecto + Oxygen AI Positron entrenado en normativa XML + MCP Server con funciones de generación de comentarios de validación.

**Solución a desarrollar:** RAG alimentado con documentación del CCMS/CSDB y normativa aplicable + Agente/orquestador que ejecuta las validaciones + MCP para gestión de comentarios y edición + LLM entrenado en normativa XML que genera comentarios y sugerencias de corrección.

---

### CU-17 · Validación de Conformidad de Ilustraciones Técnicas
Verifica automáticamente que las ilustraciones técnicas cumplan las reglas de representación definidas (líneas, contornos, escala, etiquetado), garantizando su conformidad y coherencia con el estándar aplicable.

**Solución a desarrollar:** LLM multimodal o VLM para interpretar las ilustraciones técnicas + MCP Server / Function Calling para acceder a la ilustración desde el repositorio + Agente IA que aplica los guardrails de validación y genera el informe de conformidad con las desviaciones detectadas.

---

## Publicación & Dispatching

### CU-18 · Publicación y Distribución por Solicitud en Lenguaje Natural
Permite publicar y distribuir documentación técnica mediante solicitudes en lenguaje natural, seleccionando automáticamente diseños, aplicabilidades y contenidos reutilizables. Elimina pasos manuales en el proceso de publicación final.

**Solución externa desplegable:** RWS Tridion Docs con MCP Server conectado al cliente MCP de Claude + LLM que interpreta peticiones del usuario en lenguaje natural y las traduce en operaciones de publicación + Acceso mediante MCP al motor de publicación que resuelve aplicabilidades, contenidos reutilizables y formatos de salida.

**Solución a desarrollar:** MCP Server conectado al CCMS/CSDB + Cliente MCP que recibe peticiones del usuario + LLM que interpreta las solicitudes en lenguaje natural y las traduce en operaciones de publicación sobre el motor del CCMS.

---

### CU-19 · Generación de Plantillas XSLT y CSS para Layouts Personalizados
Genera y adapta plantillas XSLT y CSS para producir layouts de publicación personalizados sobre cualquier estándar XML (S1000D, DITA, etc.). Reduce la dependencia de perfiles técnicos especializados para cada nuevo formato de salida.

**Solución a desarrollar:** Agente conectado a un LLM con conocimiento experto en XSLT, CSS y layouts de publicación PDF/HTML + LLM multimodal capaz de interpretar capturas de pantalla de layouts de referencia para entender la estructura visual requerida.

---

## General

### CU-20 · Migración y Transformación a Estándares XML
Migra y transforma documentación desde formatos heredados a estándares XML modernos (S1000D, DITA, etc.), preservando la estructura, el contenido y los metadatos. Facilita la modernización del repositorio documental sin pérdida de información.

**Solución a desarrollar:** Agente conectado a un LLM para orquestar el proceso de transformación + LLM multimodal capaz de interpretar PDFs y documentos no estructurados para extraer contenido + RAG y BM25 para interpretar el Source Data y la normativa del estándar destino + MCP Server para acceder a esquemas y plantillas del estándar XML objetivo.

---

### CU-21 · Asistente de Resolución de Service Requests
Consolida el histórico de Service Requests y aplica búsqueda semántica e híbrida para recuperar resoluciones validadas similares al problema actual. Reduce el tiempo de resolución y evita duplicar esfuerzos en incidencias recurrentes.

**Solución a desarrollar:** Agente conectado a un LLM + RAG semántico, léxico y Knowledge Graph para recuperar e interpretar el histórico de Service Requests y sus resoluciones validadas. Stack: extracción HTML, embeddings all-MiniLM-L6-v2, base de datos vectorial Qdrant, LLM Mistral Small, frontend Streamlit, backend Python.

---

### CU-22 · Asistente de Consulta de Normativas y Regulaciones
Responde preguntas sobre normativas y regulaciones sectoriales mediante un asistente conversacional entrenado sobre el corpus normativo aplicable. Ofrece respuestas precisas con trazabilidad a la fuente, sin necesidad de consultar manualmente los documentos.

**Solución externa desplegable:** Oxygen RAG sobre el corpus normativo aplicable indexado con búsqueda semántica + LLM conversacional que responde preguntas con cita exacta a la fuente normativa.

**Solución a desarrollar:** RAG semántico sobre el corpus normativo + Knowledge Graph para gestión de metadatos normativos y resolución de falsos positivos + LLM conversacional que responde con cita exacta a la fuente normativa.

---

### CU-23 · Asistente de Procedimientos Corporativos
Resuelve consultas sobre procedimientos corporativos internos a través de un asistente conversacional. Reduce el tiempo de búsqueda y garantiza que los equipos accedan siempre a la versión vigente de cada procedimiento.

**Solución a desarrollar:** RAG semántico sobre el repositorio de procedimientos corporativos internos + Knowledge Graph para gestión de relaciones entre procedimientos y versiones vigentes + LLM conversacional que responde con referencia al procedimiento y versión aplicable.

---

### CU-24 · Asistente de Conocimiento Técnico Especializado (SME)
Permite a los técnicos consultar manuales de mantenimiento, códigos NC y reglas clave mediante lenguaje natural, obteniendo respuestas precisas con referencia a la fuente. Aumenta la autonomía del técnico y reduce la dependencia del SME para consultas rutinarias.

**Solución a desarrollar:** RAG semántico sobre manuales de mantenimiento, catálogos de códigos NC y base de conocimiento técnico + BM25 para búsqueda léxica precisa sobre términos y códigos técnicos + LLM conversacional que genera respuestas con cita a la fuente. Stack: PDF Parsing (pdfplumber / PyMuPDF), embeddings MiniLM, búsqueda vectorial FAISS, LLM Mistral Small, backend FastAPI, frontend Gradio.

---

### CU-25 · Análisis de Contenido Legacy y Propuesta de Arquitectura Documental
Evalúa el contenido de repositorios y documentos legacy (PDF, Word, XML, etc.), analiza su estructura y calidad, y propone una arquitectura de información optimizada para su migración o integración en sistemas modernos.

**Solución a desarrollar:** Pipeline de ingesta que procesa documentos legacy y extrae su estructura y contenido mediante LLM multimodal + RAG y BM25 sobre el contenido extraído para identificar gaps, redundancias y patrones de estructura + Knowledge Graph para modelar las relaciones entre documentos, tipos de contenido y metadatos existentes + Agente/orquestador que genera el informe de arquitectura de información con la propuesta de estructura optimizada y plan de migración.
