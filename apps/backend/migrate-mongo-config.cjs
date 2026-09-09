// migrate-mongo owns every index in the Mongo half of the platform.
//
// Mongoose's autoIndex is off on purpose (see mongoose.module.ts): an index
// created on connect is an index created differently on every deploy, whereas
// constitution IV wants the change written down once and applied forwards.

const url = process.env.MONGO_URL;
if (!url) {
  throw new Error('MONGO_URL is not set; migrate-mongo has nothing to connect to.');
}

// The database name rides in the URL, the way every other consumer reads it.
const databaseName = (() => {
  const withoutQuery = url.split('?')[0];
  const name = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
  return name.length > 0 ? name : 'botvy';
})();

module.exports = {
  mongodb: {
    url,
    databaseName,
    options: { directConnection: true },
  },
  // The migrations, and this file no longer among them. It used to sit inside
  // this directory, which made migrate-mongo treat the configuration itself as
  // a migration and fail with `Expected a function` - a latent second fault
  // that the extension bug had been hiding, because loading never got that far.
  migrationsDir: 'migrations/mongo',
  changelogCollectionName: 'migrations_changelog',
  // `.cjs`, and every migration beside this file too.
  //
  // The backend package is `"type": "module"`, so Node reads a `.js` file here
  // as ESM and `module.exports` throws before migrate-mongo's own
  // `moduleSystem` setting is ever consulted - which is why the Mongo
  // migrations had never once run. The extension is the only thing that
  // decides this; the setting below cannot override it.
  migrationFileExtension: '.cjs',
  useFileHash: false,
  moduleSystem: 'commonjs',
};
