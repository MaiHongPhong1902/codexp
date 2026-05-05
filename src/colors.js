'use strict';

const canColor = (stream) => stream && stream.isTTY && process.env.NO_COLOR == null;
const wrap = (open, close) => {
  const fn = (s) => canColor(process.stdout) ? `\x1b[${open}m${s}\x1b[${close}m` : String(s);
  fn.stderr = (s) => canColor(process.stderr) ? `\x1b[${open}m${s}\x1b[${close}m` : String(s);
  return fn;
};

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
