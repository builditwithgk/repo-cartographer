/**
 * Minimal path-glob matcher for architecture rules. Supported wildcards:
 *   - a double-star matches any run of characters, including "/" (e.g. `src/ui/**`)
 *   - a double-star then slash matches any number of leading segments
 *   - a single star matches any run of characters except "/"
 *   - a question mark matches a single character except "/"
 * Paths are repo-relative posix strings.
 */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?"; // **/ -> optional leading segments
          i += 3;
          continue;
        }
        re += ".*"; // ** -> anything, including "/"
        i += 2;
        continue;
      }
      re += "[^/]*"; // * -> anything except "/"
      i += 1;
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }
    if ("\\^$.|+()[]{}".includes(c)) {
      re += `\\${c}`; // escape regex metacharacters
      i += 1;
      continue;
    }
    re += c;
    i += 1;
  }
  return new RegExp(`^${re}$`);
}

export function matchGlob(glob: string, path: string): boolean {
  return globToRegExp(glob).test(path);
}
