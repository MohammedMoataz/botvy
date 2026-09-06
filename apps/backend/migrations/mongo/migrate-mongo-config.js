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
  migrationsDir: 'migrations/mongo',
  changelogCollectionName: 'migrations_changelog',
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'commonjs',
};
