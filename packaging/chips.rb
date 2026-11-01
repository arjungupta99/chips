# A draft. It does not point at a real release yet: `url` and `sha256` are filled in by the
# release job, and the tap does not exist until Phase 7 puts the repository in public (the plan's
# M7.x, and the open decision about the disclosure addresses). It is here now because M2.1 asks
# for the draft, and because writing it is what showed that the CLI must not need a compiler:
# `better-sqlite3` is the one dependency that does, and a bottle would have to carry it.
#
#   brew install arjungupta99/chips/chips
#
class Chips < Formula
  desc "Supervise your harnesses: chat with them, watch what they do, decide when they ask"
  homepage "https://chipschat.ai"
  url "https://github.com/arjungupta99/chips/releases/download/v0.0.0/chips-0.0.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "FSL-1.1-ALv2"

  depends_on "node@22"

  def install
    system "npm", "install", "--omit=dev", "--ignore-scripts", *std_npm_args
    libexec.glob("lib/node_modules/*/bin/chips").each { |file| bin.install_symlink file }
  end

  service do
    run [opt_bin/"chips", "serve"]
    keep_alive true
    working_dir var/"chips"
    log_path var/"log/chips.log"
    error_log_path var/"log/chips.log"
  end

  test do
    assert_match "supervise your harnesses", shell_output("#{bin}/chips help")
  end
end
