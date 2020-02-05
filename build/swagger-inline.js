"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var Promise = require('bluebird');

var jsYaml = require('js-yaml');

var _ = require('lodash');

var Loader = require('./loader');

var Extractor = require('./extractor');

var Options = require('./options');

function outputResult(object, options) {
  return new Promise(function (resolve) {
    var result = options.isJSON() ? JSON.stringify(object, null, 2) : jsYaml.dump(object);
    resolve(result);
  });
}

function mergeEndpointsWithBase() {
  var swaggerBase = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var endpoints = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
  return endpoints.reduce(function (prev, current) {
    var method = current.method;
    var route = current.route;

    var descriptor = _.omit(current, ['method', 'route']);

    if (!method || !route) {
      return prev;
    }

    return _.set(prev, ['paths', route, method], descriptor);
  }, swaggerBase);
}

function mergeSchemasWithBase() {
  var swaggerBase = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var schemas = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
  return schemas.reduce(function (prev, current) {
    var name = current.name;

    var descriptor = _.omit(current, ['name']);

    if (!name) {
      return prev;
    }

    return _.set(prev, ['components', 'schemas', name], descriptor);
  }, swaggerBase);
}

function swaggerInline(globPatterns, providedOptions) {
  if (typeof globPatterns === 'undefined') {
    throw new TypeError('No files specified.');
  }

  var options = new Options(providedOptions);
  var log = options.getLogger();
  var base = options.getBase();
  var pattern = options.getPattern();

  if (!base) {
    throw new Error('No base specification provided!');
  }

  return Loader.resolvePaths(globPatterns, options).then(function (files) {
    return Loader.loadBase(base, options).then(function (baseObj) {
      var swaggerVersion = parseInt(baseObj.swagger || baseObj.openapi, 10);

      if (Object.keys(baseObj).length === 0) {
        throw new Error("The base specification either wasn't found, or it is not a Swagger or OpenAPI definition.");
      }

      log("".concat(files.length, " files matched..."));
      return Loader.loadFiles(files).then(function (filesData) {
        var successfulFiles = filesData.map(function (fileData, index) {
          return {
            fileData: fileData,
            fileName: files[index]
          };
        }).filter(function (fileInfo) {
          return typeof fileInfo.fileData === 'string';
        });
        var endpoints = [];
        var schemas = [];
        successfulFiles.forEach(function (fileInfo) {
          try {
            var newEndpoints = Extractor.extractEndpointsFromCode(fileInfo.fileData, _objectSpread({
              filename: fileInfo.fileName,
              scope: options.getScope()
            }, pattern && {
              pattern: pattern
            }));
            newEndpoints = Loader.addResponse(newEndpoints);
            newEndpoints = Loader.expandParams(newEndpoints, swaggerVersion);
            endpoints = _.concat(endpoints, newEndpoints);
            var scheme = Extractor.extractSchemasFromCode(fileInfo.fileData, _objectSpread({
              filename: fileInfo.fileName,
              scope: options.getScope()
            }, pattern && {
              pattern: pattern
            }));

            _.remove(scheme, function (s) {
              return _.isEmpty(s);
            });

            schemas = _.concat(schemas, scheme);
          } catch (e) {
            throw new Error(e.toString(), fileInfo.fileName);
          }
        });
        log("".concat(endpoints.length, " definitions found..."));
        log("".concat(schemas.length, " schemas found..."));
        var baseObjWithEndpoints = mergeEndpointsWithBase(baseObj, endpoints);
        var swagger = mergeSchemasWithBase(baseObjWithEndpoints, schemas);
        return outputResult(swagger, options);
      });
    });
  });
}

module.exports = swaggerInline;