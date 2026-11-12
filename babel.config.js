module.exports = function (api) {
  api.cache.using(() => process.env.NODE_ENV);
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    presets: ['babel-preset-expo'],
    plugins: isProduction ? [['transform-remove-console', { exclude: ['info'] }]] : [],
  };
};
