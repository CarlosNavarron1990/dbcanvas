const translations = {
  en: {
    // Navbar
    pricing: 'Pricing',
    download: 'Download',
    dashboard: 'Dashboard',
    login: 'Login',
    logout: 'Logout',
    getStarted: 'Get Started',

    // Hero
    heroBadge: 'MCP Server for SQL Databases',
    heroTitle1: 'Give your AI IDE',
    heroTitle2: 'full database visibility',
    heroSub: 'DBCanvas connects Claude, Cursor, and other AI IDEs to your SQL databases. Explore schemas, simulate SP changes, trace data lineage — all from your editor.',
    downloadFree: 'Download Free',
    viewPricing: 'View Pricing',

    // Features
    featuresTitle: 'Everything you need to debug SQL from AI',
    feat1Title: '18 MCP Tools',
    feat1Desc: 'Full SQL inspection from your AI IDE. Claude, Cursor, Codex, Antigravity.',
    feat2Title: 'SP Simulator',
    feat2Desc: 'Test stored procedure changes against captured data. Never break production.',
    feat3Title: 'Data Lineage',
    feat3Desc: 'Trace any field across tables and stored procedures. See the full data flow.',
    feat4Title: 'Read-Only Safety',
    feat4Desc: 'Blocks INSERT, UPDATE, DELETE. Only SELECT queries allowed.',
    feat5Title: 'Auto-Discovery',
    feat5Desc: 'Finds your connection string from .env, web.config, appsettings.json.',
    feat6Title: 'Visual Dashboard',
    feat6Desc: 'Force-directed graph, Obsidian-style controls, dark/light theme.',

    // Simulator
    simTitle: 'How the SP Simulator works',
    simStep1: 'Capture',
    simStep1Desc: 'Tell your AI: "I\'m going to edit SP_X with these params." DBCanvas captures the real data the SP uses.',
    simStep2: 'Edit',
    simStep2Desc: 'Modify the stored procedure in your IDE. Change queries, add columns, fix bugs.',
    simStep3: 'Simulate',
    simStep3Desc: 'Ask your AI to simulate. DBCanvas runs the modified SP against local data and shows a diff.',
    simStep4: 'Deploy',
    simStep4Desc: 'Only push to production after validating the simulation. Zero surprises.',

    // Install
    installTitle: 'Install in 30 seconds',
    installOr: 'Or download the desktop app for automatic setup.',

    // CTA
    ctaTitle: 'Ready to debug SQL with AI?',
    ctaSub: 'Free tier includes 9 tools. No credit card required.',
    createFree: 'Create Free Account',
    downloadApp: 'Download App',

    // Pricing
    pricingTitle: 'Simple, transparent pricing',
    pricingSub: 'Start free. Upgrade when you need the simulator.',
    mostPopular: 'Most Popular',
    free: 'Free',
    forever: 'forever',
    month: '/month',
    custom: 'Custom',
    freeCta: 'Get Started',
    proCta: 'Start Pro Trial',
    teamCta: 'Start Team Trial',
    entCta: 'Contact Sales',
    // Free features
    f_tools9: '9 MCP tools',
    f_1proj: '1 project',
    f_10tables: '10 tables sync',
    f_schema: 'Schema explorer',
    f_query: 'Query execution',
    f_graph: 'Basic graph view',
    // Pro features
    f_tools18: '18 MCP tools',
    f_unlimited: 'Unlimited projects',
    f_simulator: 'SP Simulator (capture + simulate)',
    f_lineage: 'Data lineage',
    f_diff: 'SP diff / timeline',
    f_annotations: 'AI annotations',
    f_agents: 'Agent analysis (4 perspectives)',
    f_export: 'Export PNG, SQL, CSV',
    f_support: 'Priority support',
    // Team
    f_allPro: 'Everything in Pro',
    f_5seats: '5 team seats',
    f_sharedAnnot: 'Shared annotations',
    f_sharedCap: 'Shared captures',
    f_teamDash: 'Team dashboard',
    f_admin: 'Admin controls',
    // Enterprise
    f_allTeam: 'Everything in Team',
    f_unlimitedSeats: 'Unlimited seats',
    f_sso: 'SSO / SAML',
    f_onprem: 'On-premise deploy',
    f_sla: 'Custom SLA',
    f_dedicated: 'Dedicated support',

    // Download
    dlTitle: 'Download DBCanvas',
    dlSub: 'Desktop app with visual dashboard, automatic MCP registration, and graph explorer.',
    dlMac: 'macOS',
    dlMacDesc: 'Apple Silicon & Intel',
    dlWin: 'Windows',
    dlWinDesc: 'Windows 10/11 (64-bit)',
    dlLinux: 'Linux',
    dlLinuxDesc: 'AppImage (Ubuntu, Fedora, etc.)',
    dlCli: 'Or install via CLI (no desktop app needed)',
    dlMcpConfig: 'MCP config for your IDE',

    // Auth
    welcomeBack: 'Welcome back',
    signInSub: 'Sign in to your DBCanvas account',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    noAccount: "Don't have an account?",
    createOne: 'Create one',
    createAccount: 'Create your account',
    createSub: 'Get started with DBCanvas for free',
    fullName: 'Full name',
    email: 'Email',
    password: 'Password (min 6 chars)',
    creating: 'Creating...',
    createFreeAccount: 'Create Free Account',
    haveAccount: 'Already have an account?',
    signInLink: 'Sign in',

    // Dashboard
    yourAccount: 'Your Account',
    yourAccountSub: 'Manage your license and subscription',
    licenseKey: 'License Key',
    copy: 'Copy',
    copied: 'Copied',
    mcpConfig: 'MCP Configuration',
    availableTools: 'Available Tools',
    upgradeMsg: 'Upgrade to Pro to unlock SP Simulator, Data Lineage, and 9 more tools.',
    upgradePro: 'Upgrade to Pro — $19/mo',
    subscription: 'Subscription',
    manageStripe: 'Manage Subscription (Stripe Portal)',
    noLicense: 'No license',
    addHint: 'Add this to your MCP config:',

    // Checkout
    paymentSuccess: 'Payment Successful!',
    paymentSuccessSub: 'Your license has been upgraded. Your new tools are now available in your IDE.',
    goToDash: 'Go to Dashboard',

    // Footer
    builtBy: 'Built by XMN',
  },

  es: {
    pricing: 'Precios',
    download: 'Descargar',
    dashboard: 'Panel',
    login: 'Iniciar Sesión',
    logout: 'Cerrar Sesión',
    getStarted: 'Comenzar',

    heroBadge: 'Servidor MCP para Bases de Datos SQL',
    heroTitle1: 'Dale a tu IDE con IA',
    heroTitle2: 'visibilidad total de tu base de datos',
    heroSub: 'DBCanvas conecta Claude, Cursor y otros IDEs con IA a tus bases de datos SQL. Explora esquemas, simula cambios en SPs, traza el linaje de datos — todo desde tu editor.',
    downloadFree: 'Descargar Gratis',
    viewPricing: 'Ver Precios',

    featuresTitle: 'Todo lo que necesitas para depurar SQL con IA',
    feat1Title: '18 Herramientas MCP',
    feat1Desc: 'Inspección SQL completa desde tu IDE. Claude, Cursor, Codex, Antigravity.',
    feat2Title: 'Simulador de SP',
    feat2Desc: 'Prueba cambios en stored procedures contra datos capturados. Sin romper producción.',
    feat3Title: 'Linaje de Datos',
    feat3Desc: 'Rastrea cualquier campo a través de tablas y stored procedures. Ve el flujo completo.',
    feat4Title: 'Seguridad de Solo Lectura',
    feat4Desc: 'Bloquea INSERT, UPDATE, DELETE. Solo consultas SELECT permitidas.',
    feat5Title: 'Auto-Descubrimiento',
    feat5Desc: 'Encuentra tu cadena de conexión desde .env, web.config, appsettings.json.',
    feat6Title: 'Dashboard Visual',
    feat6Desc: 'Grafo de fuerza dirigida, controles estilo Obsidian, tema claro/oscuro.',

    simTitle: 'Cómo funciona el Simulador de SP',
    simStep1: 'Capturar',
    simStep1Desc: 'Dile a tu IA: "Voy a editar SP_X con estos parámetros." DBCanvas captura los datos reales que usa el SP.',
    simStep2: 'Editar',
    simStep2Desc: 'Modifica el stored procedure en tu IDE. Cambia queries, agrega columnas, corrige bugs.',
    simStep3: 'Simular',
    simStep3Desc: 'Pide a tu IA que simule. DBCanvas ejecuta el SP modificado contra datos locales y muestra un diff.',
    simStep4: 'Desplegar',
    simStep4Desc: 'Solo sube a producción después de validar la simulación. Cero sorpresas.',

    installTitle: 'Instala en 30 segundos',
    installOr: 'O descarga la app de escritorio para configuración automática.',

    ctaTitle: '¿Listo para depurar SQL con IA?',
    ctaSub: 'El plan gratuito incluye 9 herramientas. Sin tarjeta de crédito.',
    createFree: 'Crear Cuenta Gratis',
    downloadApp: 'Descargar App',

    pricingTitle: 'Precios simples y transparentes',
    pricingSub: 'Comienza gratis. Actualiza cuando necesites el simulador.',
    mostPopular: 'Más Popular',
    free: 'Gratis',
    forever: 'para siempre',
    month: '/mes',
    custom: 'Personalizado',
    freeCta: 'Comenzar',
    proCta: 'Iniciar Prueba Pro',
    teamCta: 'Iniciar Prueba Team',
    entCta: 'Contactar Ventas',
    f_tools9: '9 herramientas MCP',
    f_1proj: '1 proyecto',
    f_10tables: '10 tablas sincronizadas',
    f_schema: 'Explorador de esquemas',
    f_query: 'Ejecución de consultas',
    f_graph: 'Vista de grafo básica',
    f_tools18: '18 herramientas MCP',
    f_unlimited: 'Proyectos ilimitados',
    f_simulator: 'Simulador de SP (captura + simulación)',
    f_lineage: 'Linaje de datos',
    f_diff: 'Diff / historial de SP',
    f_annotations: 'Anotaciones con IA',
    f_agents: 'Análisis por agentes (4 perspectivas)',
    f_export: 'Exportar PNG, SQL, CSV',
    f_support: 'Soporte prioritario',
    f_allPro: 'Todo lo de Pro',
    f_5seats: '5 licencias de equipo',
    f_sharedAnnot: 'Anotaciones compartidas',
    f_sharedCap: 'Capturas compartidas',
    f_teamDash: 'Dashboard de equipo',
    f_admin: 'Controles de administrador',
    f_allTeam: 'Todo lo de Team',
    f_unlimitedSeats: 'Licencias ilimitadas',
    f_sso: 'SSO / SAML',
    f_onprem: 'Despliegue on-premise',
    f_sla: 'SLA personalizado',
    f_dedicated: 'Soporte dedicado',

    dlTitle: 'Descargar DBCanvas',
    dlSub: 'App de escritorio con dashboard visual, registro automático de MCP y explorador de grafos.',
    dlMac: 'macOS',
    dlMacDesc: 'Apple Silicon & Intel',
    dlWin: 'Windows',
    dlWinDesc: 'Windows 10/11 (64-bit)',
    dlLinux: 'Linux',
    dlLinuxDesc: 'AppImage (Ubuntu, Fedora, etc.)',
    dlCli: 'O instala por CLI (sin app de escritorio)',
    dlMcpConfig: 'Configuración MCP para tu IDE',

    welcomeBack: 'Bienvenido de vuelta',
    signInSub: 'Inicia sesión en tu cuenta DBCanvas',
    signIn: 'Iniciar Sesión',
    signingIn: 'Ingresando...',
    noAccount: '¿No tienes cuenta?',
    createOne: 'Crea una',
    createAccount: 'Crea tu cuenta',
    createSub: 'Comienza con DBCanvas gratis',
    fullName: 'Nombre completo',
    email: 'Correo electrónico',
    password: 'Contraseña (mín. 6 caracteres)',
    creating: 'Creando...',
    createFreeAccount: 'Crear Cuenta Gratis',
    haveAccount: '¿Ya tienes cuenta?',
    signInLink: 'Inicia sesión',

    yourAccount: 'Tu Cuenta',
    yourAccountSub: 'Administra tu licencia y suscripción',
    licenseKey: 'Clave de Licencia',
    copy: 'Copiar',
    copied: 'Copiado',
    mcpConfig: 'Configuración MCP',
    availableTools: 'Herramientas Disponibles',
    upgradeMsg: 'Actualiza a Pro para desbloquear el Simulador de SP, Linaje de Datos y 9 herramientas más.',
    upgradePro: 'Actualizar a Pro — $19/mes',
    subscription: 'Suscripción',
    manageStripe: 'Administrar Suscripción (Portal Stripe)',
    noLicense: 'Sin licencia',
    addHint: 'Agrega esto a tu config MCP:',

    paymentSuccess: '¡Pago Exitoso!',
    paymentSuccessSub: 'Tu licencia ha sido actualizada. Tus nuevas herramientas ya están disponibles en tu IDE.',
    goToDash: 'Ir al Panel',

    builtBy: 'Creado por XMN',
  },
};

type Lang = 'en' | 'es';
type TranslationKey = keyof typeof translations.en;

function detectLanguage(): Lang {
  const stored = localStorage.getItem('dbc_lang');
  if (stored === 'en' || stored === 'es') return stored;
  const browser = navigator.language?.substring(0, 2);
  return browser === 'es' ? 'es' : 'en';
}

let currentLang: Lang = detectLanguage();

export function t(key: TranslationKey): string {
  return translations[currentLang][key] || translations.en[key] || key;
}

export function getLang(): Lang { return currentLang; }

export function setLang(lang: Lang) {
  currentLang = lang;
  localStorage.setItem('dbc_lang', lang);
  window.dispatchEvent(new Event('langchange'));
}

export function toggleLang() {
  setLang(currentLang === 'en' ? 'es' : 'en');
}
