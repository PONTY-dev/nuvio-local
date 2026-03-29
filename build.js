const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const transpileMode = args.includes('--transpile');
const targets = args.filter(a => !a.startsWith('--'));

function getProviders() {
  if (targets.length > 0) return targets;
  const srcDir = path.join(__dirname, 'src');
  if (!fs.existsSync(srcDir)) return [];
  return fs.readdirSync(srcDir).filter(f =>
    fs.statSync(path.join(srcDir, f)).isDirectory()
  );
}

async function buildProvider(name) {
  const srcPath = path.join(__dirname, 'src', name, 'index.js');
  const outPath = path.join(__dirname, 'providers', name + '.js');

  if (!fs.existsSync(srcPath)) {
    console.log(`[skip] No src/${name}/index.js found`);
    return;
  }

  await esbuild.build({
    entryPoints: [srcPath],
    outfile: outPath,
    bundle: true,
    platform: 'neutral',
    target: 'es5',
    format: 'cjs',
    external: ['axios', 'cheerio-without-node-native', 'crypto-js'],
    minify: false,
  });

  console.log(`[built] ${name} → providers/${name}.js`);
}

async function transpileFile(name) {
  const filePath = path.join(__dirname, 'providers', name + '.js');
  if (!fs.existsSync(filePath)) {
    console.log(`[skip] providers/${name}.js not found`);
    return;
  }
  await esbuild.build({
    entryPoints: [filePath],
    outfile: filePath,
    bundle: false,
    platform: 'neutral',
    target: 'es5',
    format: 'cjs',
    allowOverwrite: true,
  });
  console.log(`[transpiled] providers/${name}.js`);
}

async function main() {
  if (!fs.existsSync(path.join(__dirname, 'providers'))) {
    fs.mkdirSync(path.join(__dirname, 'providers'));
  }

  if (transpileMode) {
    const files = targets.length > 0 ? targets :
      fs.readdirSync(path.join(__dirname, 'providers'))
        .filter(f => f.endsWith('.js'))
        .map(f => f.replace('.js', ''));
    for (const f of files) await transpileFile(f);
    return;
  }

  const providers = getProviders();
  if (providers.length === 0) {
    console.log('No providers found in src/');
    return;
  }

  for (const p of providers) await buildProvider(p);

  if (watchMode) {
    console.log('Watching for changes...');
    const srcDir = path.join(__dirname, 'src');
    fs.watch(srcDir, { recursive: true }, async (event, filename) => {
      if (!filename) return;
      const providerName = filename.split(path.sep)[0];
      console.log(`[change] ${filename}`);
      await buildProvider(providerName);
    });
  }
}

main().catch(console.error);
