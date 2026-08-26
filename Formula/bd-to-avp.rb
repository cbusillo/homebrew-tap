class BdToAvp < Formula
  desc "Convert 3D Blu-ray video to Apple spatial video"
  homepage "https://github.com/cbusillo/BD_to_AVP"
  url "https://github.com/cbusillo/BD_to_AVP/archive/refs/tags/v0.3.2.tar.gz"
  sha256 "da99f4676b0cb941e8a06bdf261da0b995d13c06886f854249a08c47db3f2270"
  license "GPL-3.0-or-later"

  livecheck do
    url :stable
    strategy :github_latest
  end

  depends_on "uv" => :build
  depends_on arch: :arm64
  depends_on "ffmpeg"
  depends_on macos: :sonoma
  depends_on "python@3.12"

  def install
    ENV["UV_PROJECT_ENVIRONMENT"] = libexec
    ENV["UV_PYTHON_DOWNLOADS"] = "never"
    without_gui = %w[pyside6 pyside6-addons pyside6-essentials shiboken6].flat_map do |package|
      ["--no-install-package", package]
    end
    system "uv", "sync", "--frozen", "--no-config", "--no-default-groups", "--no-editable",
           "--python", formula_opt_bin("python@3.12")/"python3.12", *without_gui
    bin.install_symlink libexec/"bin/bd-to-avp"
    bin.install_symlink libexec/"bin/bd-to-avp-worker"
  end

  def caveats
    <<~EOS
      This formula installs the command-line interface without PySide6.
      Use the signed release DMG for the desktop app.

      MakeMKV is only required for Blu-ray disc input and remains a separate
      installation from https://www.makemkv.com/.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/bd-to-avp --version")
    assert_match "Process 3D Blu-ray", shell_output("#{bin}/bd-to-avp --help")
    system libexec/"bin/python", "-c",
           "import importlib.util; assert importlib.util.find_spec('PySide6') is None"
  end
end
