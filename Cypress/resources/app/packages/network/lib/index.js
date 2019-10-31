"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var agent_1 = __importDefault(require("./agent"));
exports.agent = agent_1.default;
var connect = __importStar(require("./connect"));
exports.connect = connect;
var allow_destroy_1 = require("./allow-destroy");
exports.allowDestroy = allow_destroy_1.allowDestroy;
