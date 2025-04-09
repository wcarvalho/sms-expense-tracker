const path = require('path');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './script.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    port: 3000,
    hot: true,
    historyApiFallback: true,
    open: true
  },
  plugins: [
    new Dotenv({
      systemvars: true
    }),
    new HtmlWebpackPlugin({
      template: './index.html',
      filename: 'index.html'
    }),
    new CopyPlugin({
      patterns: [
        { from: "styles.css", to: "styles.css" }
      ],
    }),
  ]
}; 