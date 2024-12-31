const path = require('path');
const Dotenv = require('dotenv-webpack');

module.exports = {
  entry: './script.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    publicPath: '/sms-expense-tracker/'
  },
  plugins: [
    new Dotenv({
      systemvars: true
    })
  ]
}; 