'use strict';

const useColor = process.stdout.isTTY && process.env.NO_COLOR == null;
const wrap = (open, close) => (s) => useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s);

module.exports = {
  bold:    wrap(1, 22),
  dim:     wrap(2, 22),
  red:     wrap(31, 39),
  green:   wrap(32, 39),
  yellow:  wrap(33, 39),
  blue:    wrap(34, 39),
  magenta: wrap(35, 39),
  cyan:    wrap(36, 39),
  gray:    wrap(90, 39),
};
