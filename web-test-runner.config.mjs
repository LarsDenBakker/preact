import { importMapsPlugin } from '@web/dev-server-import-maps';
import { legacyPlugin } from '@web/dev-server-legacy';
import { createSauceLabsLauncher } from '@web/test-runner-saucelabs';
import rollupBabel from '@rollup/plugin-babel';
import { fromRollup, rollupBundlePlugin } from '@web/dev-server-rollup';
import nodeResolve from '@rollup/plugin-node-resolve';
import alias from '@rollup/plugin-alias';
import globby from 'globby';
import fs from 'fs';
import os from 'os';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

const testFiles = globby.sync('{debug/test,hooks/test,compat/test,test-utils/test,test}/{browser,shared}/{**/*,*}.test.{js,jsx}')

let browsers;
const sauceLabsUser = process.env.SAUCE_USERNAME;
const sauceLabsKey = process.env.SAUCE_ACCESS_KEY;
const sauceLabs = sauceLabsUser && sauceLabsKey;
// const sauceLabs = false;
if (sauceLabs) {
	const sauceLabsLauncher = createSauceLabsLauncher({
		user: process.env.SAUCE_USERNAME,
		key: process.env.SAUCE_ACCESS_KEY,
		// the Sauce Labs datacenter to run your tests on, defaults to 'us-west-1'
		region: 'eu-central-1'
	});

	const sharedCapabilities = {
		'sauce:options': {
			name: 'unit-tests',
			// if you are running tests in a CI, the build id might be available as an
			// environment variable. this is useful for identifying test runs
			// this is for example the name for github actions
			build: `CI #${process.env.GITHUB_RUN_NUMBER} (${process.env.GITHUB_RUN_ID})`,
			tunnelIdentifier:
				process.env.GITHUB_RUN_NUMBER ||
				`local${packageJson.version}`,
			connectLocationForSERelay: 'localhost',
			connectPortForSERelay: 4445,
			startConnect: !!sauceLabs
		}
	};
	browsers = [
		sauceLabsLauncher({
			...sharedCapabilities,
			browserName: 'chrome',
			browserVersion: 'latest',
			platformName: 'Windows 10'
		}),
		// sauceLabsLauncher({
		// 	...sharedCapabilities,
		// 	browserName: 'firefox',
		// 	browserVersion: '79.0',
		// 	platformName: 'Windows 10'
		// }),
		// sauceLabsLauncher({
		// 	...sharedCapabilities,
		// 	browserName: 'MicrosoftEdge',
		// 	browserVersion: 'latest',
		// 	platformName: 'Windows 10'
		// }),
		// sauceLabsLauncher({
		// 	...sharedCapabilities,
		// 	browserName: 'internet explorer',
		// 	browserVersion: '11.0',
		// 	platformName: 'Windows 7'
		// })
	];
}

const rename = {};
const mangle = JSON.parse(fs.readFileSync('./mangle.json', 'utf8'));
for (let prop in mangle.props.props) {
	let name = prop;
	if (name[0] === '$') {
		name = name.slice(1);
	}

	rename[name] = mangle.props.props[prop];
}

const babel = fromRollup(rollupBabel.default);

export default {
	files: testFiles,
	nodeResolve: true,
	mimeTypes: {
		'**/*.jsx': 'js'
	},
	testFramework: {
		config: {
			timeout: 10000
		}
	},
	browsers,
	// SauceLabs only allows a max concurrency of 2 in the OSS plan. Pick
	// an automatic number based on CPU-Cores for non-saucelab runs
	concurrency: Math.max(1, os.cpus().length - 1),
	// concurrency: sauceLabs ? 2 : Math.max(1, os.cpus().length - 1),
	// SauceLabs takes a bit longer to start
	browserStartTimeout: 1000 * 60 * 5,
	plugins: [
		rollupBundlePlugin({
			rollupConfig: {
				input: testFiles,
				preserveEntrySignatures: false,
				plugins: [
					rollupBabel.default({
						sourceMaps: 'inline',
						exclude: ['node_modules/**'],
						babelHelpers: 'inline',
						plugins: [
							'@babel/plugin-syntax-dynamic-import',
							'@babel/plugin-syntax-import-meta',
							['babel-plugin-transform-rename-properties', { rename }],
							[
								'@babel/plugin-transform-react-jsx',
								{ pragma: 'createElement', pragmaFrag: 'Fragment' }
							]
						]
					}),
					alias({
						entries: {
							'preact/compat': './compat/src/index.js',
							'preact/debug': './debug/src/index.js',
							'preact/devtools': './devtools/src/index.js',
							'preact/hooks': './hooks/src/index.js',
							'preact/test-utils': './test-utils/src/index.js',
							preact: './src/index.js',
							'prop-types': './node_modules/prop-types/prop-types.js'
						}
					}),
					nodeResolve(),
				]
			}
		}),
		// importMapsPlugin({
		// 	inject: {
		// 		importMap: {
		// 			imports: {
		// 				'preact/compat': '/compat/src/index.js',
		// 				'preact/debug': '/debug/src/index.js',
		// 				'preact/devtools': '/devtools/src/index.js',
		// 				'preact/hooks': '/hooks/src/index.js',
		// 				'preact/test-utils': '/test-utils/src/index.js',
		// 				preact: '/src/index.js',
		// 				'prop-types': '/node_modules/prop-types/prop-types.js'
		// 			}
		// 		}
		// 	}
		// }),
		babel({
			sourceMaps: 'inline',
			exclude: ['node_modules/**'],
			babelHelpers: 'inline',
			plugins: [
				'@babel/plugin-syntax-dynamic-import',
				'@babel/plugin-syntax-import-meta',
				['babel-plugin-transform-rename-properties', { rename }],
				[
					'@babel/plugin-transform-react-jsx',
					{ pragma: 'createElement', pragmaFrag: 'Fragment' }
				]
			]
		}),
		legacyPlugin()
	]
};
