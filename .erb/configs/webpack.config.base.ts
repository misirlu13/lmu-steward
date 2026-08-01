/**
 * Base webpack config used across other specific configs
 */

import path from 'path';
import webpack from 'webpack';
import TsconfigPathsPlugins from 'tsconfig-paths-webpack-plugin';
import webpackPaths from './webpack.paths';
import { dependencies as externals } from '../../release/app/package.json';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every directory above the project root, in the forward-slash form watchpack
 * compares against. Resolving symlinks makes enhanced-resolve walk each path
 * segment, so the drive root ends up as a file dependency; watching it makes
 * watchpack scan the whole drive, which fails on Windows system folders
 * ("EINVAL: invalid argument, lstat 'D:\System Volume Information'"). Nothing
 * we build lives above the root, so these are safe to leave unwatched.
 */
const ancestorsOfRoot: string[] = [];
let ancestor = path.dirname(webpackPaths.rootPath);
while (path.dirname(ancestor) !== ancestor) {
  ancestorsOfRoot.push(escapeRegExp(ancestor.replace(/\\/g, '/')));
  ancestor = path.dirname(ancestor);
}
ancestorsOfRoot.push(escapeRegExp(ancestor.replace(/\\/g, '/')));

const configuration: webpack.Configuration = {
  externals: [...Object.keys(externals || {})],

  stats: 'errors-only',

  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            // Remove this line to enable type checking in webpack builds
            transpileOnly: true,
            compilerOptions: {
              module: 'nodenext',
              moduleResolution: 'nodenext',
            },
          },
        },
      },
    ],
  },

  output: {
    path: webpackPaths.srcPath,
    // https://github.com/webpack/webpack/issues/1114
    library: { type: 'commonjs2' },
  },

  watchOptions: {
    ignored: new RegExp(
      `(^|[\\\\/])(node_modules|\\.git|System Volume Information|\\$RECYCLE\\.BIN)([\\\\/]|$)|^(${ancestorsOfRoot.join(
        '|',
      )})$`,
    ),
  },

  /**
   * Determine the array of extensions that should be used to resolve modules.
   */
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
    modules: [webpackPaths.srcPath, 'node_modules'],
    // There is no need to add aliases here, the paths in tsconfig get mirrored
    plugins: [new TsconfigPathsPlugins()],
  },

  plugins: [new webpack.EnvironmentPlugin({ NODE_ENV: 'production' })],
};

export default configuration;
