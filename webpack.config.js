const path = require('path');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');

module.exports = {
  entry: './script.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.FIREBASE_API_KEY': JSON.stringify(process.env.FIREBASE_API_KEY)
    }),
    new Dotenv({
      systemvars: true
    })
  ]
}; 