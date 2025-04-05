{pkgs}: {
  deps = [
    pkgs.glibcLocales
    pkgs.libGLU
    pkgs.libGL
    pkgs.postgresql
    pkgs.openssl
  ];
}
