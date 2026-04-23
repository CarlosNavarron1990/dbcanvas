import knex from 'knex';

const connectionString = "Server=10.90.1.16;Database=SavarExpressBD_Test;User Id=savaradmin;Password=Savar2020.;Encrypt=false;";

const parts = connectionString.split(';');
const config = {
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 30000,
        requestTimeout: 60000,
    }
};
parts.forEach(part => {
    const eqIndex = part.indexOf('=');
    if (eqIndex < 0) return;
    const key = part.substring(0, eqIndex).trim().toLowerCase();
    const value = part.substring(eqIndex + 1).trim();
    if (key === 'server') config.server = value;
    if (key === 'database') config.database = value;
    if (key === 'user id') config.user = value;
    if (key === 'password') config.password = value;
});

const db = knex({
    client: 'mssql',
    connection: config
});

async function run() {
  try {
    const name = "SP_SET_WEB_ASIGNA_PEDIDO_MASIVO_WEB";
    const query = `
      SELECT 
          OBJECT_NAME(referencing_id) AS referencing_name,
          referenced_entity_name AS referenced_name,
          o.type_desc AS referencing_type,
          ro.type_desc AS referenced_type
      FROM sys.sql_expression_dependencies sed
      INNER JOIN sys.objects o ON sed.referencing_id = o.object_id
      LEFT JOIN sys.objects ro ON sed.referenced_id = ro.object_id
      WHERE o.name = ?
    `;
    const deps = await db.raw(query, [name]);
    console.log(JSON.stringify(deps, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

run();
