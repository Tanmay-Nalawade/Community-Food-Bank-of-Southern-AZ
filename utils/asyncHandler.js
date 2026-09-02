function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function wrapControllerAsync(controller) {
  const wrapped = {};
  Object.keys(controller).forEach((key) => {
    wrapped[key] = asyncHandler(controller[key]);
  });
  return wrapped;
}

module.exports = { asyncHandler, wrapControllerAsync };
