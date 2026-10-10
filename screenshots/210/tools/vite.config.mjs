// The scratchpad's Vite config for wt-210, as #209's for wt-209: its node_modules is a symlink into the main checkout, so Vite must be
// allowed to serve the fonts from there; and its own dependency cache, so as not to touch the one the other checkouts' Vites share.
export default {
  root: '/private/tmp/claude-502/-Users-guillem-arias-Documents-gariasf-viapeninsula/1cca112d-d483-43d6-b15a-77bfefc784ae/scratchpad/wt-210',
  cacheDir: '/private/tmp/claude-502/-Users-guillem-arias-Documents-gariasf-viapeninsula/1cca112d-d483-43d6-b15a-77bfefc784ae/scratchpad/210/.vite-cache',
  server: { port: 5210, strictPort: true, fs: { allow: ['/private/tmp/claude-502/-Users-guillem-arias-Documents-gariasf-viapeninsula/1cca112d-d483-43d6-b15a-77bfefc784ae/scratchpad/wt-210', '/Users/guillem.arias/Documents/gariasf/viapeninsula/node_modules'] } },
};
