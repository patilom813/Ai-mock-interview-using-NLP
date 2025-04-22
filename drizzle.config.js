/** @type { import("drizzle-kit").Config } */
export default {
    schema: "./utils/schema.js",
    dialect: 'postgresql',
    dbCredentials: {
        url: 'postgresql://neondb_owner:npg_nEF0UA8lyYcK@ep-red-cake-a5xlliaf-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
    }
};