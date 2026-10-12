// Self-contained installer for the Inter-Varsity Competition Platform.
//
// This file is compiled by the Windows-built-in .NET Framework compiler
// (csc.exe) — no third-party tools, no downloads. The finished executable is
// built as:   <Setup.exe>  +  8-byte marker  +  <payload.zip>
//
// At run time the stub finds that marker in its own file, opens everything
// after it as a ZIP (via a bounded stream, so no temp copy of the payload is
// needed), extracts it, creates shortcuts, and offers to launch.
//
// Language level: C# 5 / .NET Framework 4.x — deliberately no interpolation,
// no null-conditional operators, no expression-bodied members.

using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;

namespace InterVarsitySetup
{
    internal static class Program
    {
        // Marker separating the stub from the appended payload.
        //
        // IMPORTANT: these bytes are DERIVED at runtime (ASCII ^ 0x5A) rather than
        // declared as a byte[] literal. A literal marker is embedded verbatim in
        // the compiled assembly, so FindMagic would match the program's own data
        // and report a bogus payload offset.
        private static readonly byte[] Magic = BuildMagic();

        private static byte[] BuildMagic()
        {
            // Seed must stay in sync with scripts/make-installer.js.
            byte[] plain = new byte[]
            {
                (byte)'I', (byte)'n', (byte)'t', (byte)'e', (byte)'r', (byte)'V',
                (byte)'a', (byte)'r', (byte)'s', (byte)'i', (byte)'t', (byte)'y',
                (byte)'P', (byte)'l', (byte)'a', (byte)'t', (byte)'f', (byte)'o',
                (byte)'r', (byte)'m', (byte)'S', (byte)'e', (byte)'t', (byte)'u',
                (byte)'p', (byte)'!', (byte)'2', (byte)'0', (byte)'2', (byte)'6'
            };
            for (int i = 0; i < plain.Length; i++)
            {
                plain[i] = (byte)(plain[i] ^ 0x5A);
            }
            return plain;
        }

        private const string AppFolderName = "InterVarsityPlatform";
        private const string ShortcutName = "Inter-Varsity Platform";
        private const string MenuFolderName = "Inter-Varsity Competition Platform";
        private const string LauncherName = "Start Offline.bat";

        private static int Main(string[] args)
        {
            try
            {
                return Run(args);
            }
            catch (Exception ex)
            {
                Console.WriteLine();
                Console.WriteLine("  Installation failed: " + ex.Message);
                Console.WriteLine();
                Console.WriteLine(ex.ToString());
                Console.WriteLine();
                Console.Write("  Press Enter to close...");
                Console.ReadLine();
                return 1;
            }
        }

        private static int Run(string[] args)
        {
            string self = Assembly.GetExecutingAssembly().Location;

            Banner();

            // ── 1. locate the payload appended to this executable ──────────────
            long zipStart;
            using (FileStream fs = File.OpenRead(self))
            {
                long marker = FindMagic(fs);
                // Skip PAST the marker: the archive begins after it. Starting the
                // view on the marker itself skews every central-directory offset
                // by the marker's length, and ZipArchive then rejects the entry
                // count instead of telling you what is actually wrong.
                zipStart = marker < 0 ? -1 : marker + Magic.Length;
            }
            if (zipStart < 0)
            {
                throw new InvalidOperationException(
                    "The application payload is missing from this file. " +
                    "It looks like a partial copy — please re-download/re-copy the full installer.");
            }

            // ── 2. choose a destination ────────────────────────────────────────
            string defaultTarget = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                AppFolderName);

            string target = ReadOption(args, "--dest");
            if (target == null)
            {
                Console.WriteLine("  Install location:");
                Console.WriteLine("    [Enter] " + defaultTarget);
                Console.Write("  ...or type a different folder: ");
                string line = Console.ReadLine();
                if (line != null && line.Trim().Length > 0)
                {
                    target = line.Trim().Trim('"');
                }
                else
                {
                    target = defaultTarget;
                }
            }
            target = Path.GetFullPath(target);

            // ── 3. overwrite an existing install? ──────────────────────────────
            bool upgrading = File.Exists(Path.Combine(target, LauncherName));
            if (upgrading)
            {
                Console.Write("  An installation already exists there. Overwrite it? [y/N] ");
                string a = Console.ReadLine();
                if (a == null || !a.Trim().StartsWith("y", StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine("  Cancelled. Nothing was changed.");
                    Console.WriteLine();
                    return 0;
                }
            }

            // ── 4. extract ─────────────────────────────────────────────────────
            Console.WriteLine();
            Console.WriteLine(upgrading ? "  Upgrading..." : "  Installing...");

            long bytes = 0;
            int files = 0;
            Directory.CreateDirectory(target);

            using (FileStream fs = File.OpenRead(self))
            {
                SubRangeStream sub = new SubRangeStream(fs, zipStart, fs.Length - zipStart);
                using (ZipArchive zip = new ZipArchive(sub, ZipArchiveMode.Read, false))
                {
                    int total = zip.Entries.Count;
                    int done = 0;
                    foreach (ZipArchiveEntry entry in zip.Entries)
                    {
                        done++;
                        if (done % 400 == 0 || done == total)
                        {
                            Console.Write("\r  Extracting " + done + "/" + total + " files...      ");
                        }

                        string dest = SafePath(target, entry.FullName);
                        if (dest == null) continue;

                        // Directory entries end with a separator and hold no data.
                        if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\"))
                        {
                            Directory.CreateDirectory(dest);
                            continue;
                        }

                        string dir = Path.GetDirectoryName(dest);
                        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

                        entry.ExtractToFile(dest, true);
                        files++;
                        bytes += entry.Length;
                    }
                }
            }

            Console.WriteLine();
            Console.WriteLine();
            Console.WriteLine("  Installed " + files + " files (" + FormatSize(bytes) + ") to:");
            Console.WriteLine("    " + target);

            // ── 5. shortcuts ───────────────────────────────────────────────────
            string launcher = Path.Combine(target, LauncherName);
            if (!File.Exists(launcher))
            {
                throw new FileNotFoundException(
                    "The install finished but \"" + LauncherName + "\" is missing. " +
                    "The archive may be incomplete — please re-download the installer.");
            }

            string desktopLnk = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                ShortcutName + ".lnk");
            string menuLnk = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                MenuFolderName,
                ShortcutName + ".lnk");

            bool shortcutsOk = true;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(menuLnk));
                CreateShortcut(desktopLnk, launcher, target,
                    "Start the Inter-Varsity Competition Platform (offline / LAN server)");
                CreateShortcut(menuLnk, launcher, target,
                    "Start the Inter-Varsity Competition Platform (offline / LAN server)");
                Console.WriteLine("  Created Desktop and Start Menu shortcuts.");
            }
            catch (Exception ex)
            {
                shortcutsOk = false;
                Console.WriteLine("  Note: shortcuts could not be created (" + ex.Message + ").");
                Console.WriteLine("        You can still start it by double-clicking \"" + LauncherName + "\".");
            }

            WriteUninstaller(target, desktopLnk, menuLnk);

            // ── 6. launch? ─────────────────────────────────────────────────────
            Console.WriteLine();
            if (args != null && HasFlag(args, "--no-launch"))
            {
                Console.WriteLine("  Done. Run \"" + LauncherName + "\" in the install folder to start.");
                Console.WriteLine();
                return 0;
            }

            Console.Write("  Launch the platform now? [Y/n] ");
            string ans = Console.ReadLine();
            if (ans == null || ans.Trim().Length == 0 || ans.Trim().StartsWith("y", StringComparison.OrdinalIgnoreCase))
            {
                ProcessStartInfo psi = new ProcessStartInfo(launcher);
                psi.WorkingDirectory = target;
                psi.UseShellExecute = true;
                Process.Start(psi);
                Console.WriteLine();
                Console.WriteLine("  Started. A window will show the addresses to open.");
                if (!shortcutsOk)
                {
                    Console.WriteLine("  (Keep this folder — it holds the application.)");
                }
            }
            else
            {
                Console.WriteLine();
                Console.WriteLine("  Done. Double-click \"" + LauncherName + "\" in the install folder to start.");
            }

            Console.WriteLine();
            Console.Write("  Press Enter to close...");
            Console.ReadLine();
            return 0;
        }

        // ── helpers ────────────────────────────────────────────────────────────

        private static void Banner()
        {
            Console.WriteLine();
            Console.WriteLine("  ==========================================================");
            Console.WriteLine("   Inter-Varsity Competition Platform");
            Console.WriteLine("   Faculty of Science - University of Ibadan");
            Console.WriteLine("  ==========================================================");
            Console.WriteLine();
        }

        private static string ReadOption(string[] args, string name)
        {
            if (args == null) return null;
            for (int i = 0; i < args.Length; i++)
            {
                if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                {
                    return args[i + 1];
                }
            }
            return null;
        }

        private static bool HasFlag(string[] args, string name)
        {
            if (args == null) return false;
            for (int i = 0; i < args.Length; i++)
            {
                if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        /// Absolute offset of the first marker occurrence, or -1.
        private static long FindMagic(FileStream fs)
        {
            byte[] buf = new byte[1024 * 1024];
            long filePos = 0; // absolute offset of buf[0]
            int carry = 0;

            while (true)
            {
                int read = fs.Read(buf, carry, buf.Length - carry);
                if (read <= 0) break;

                int total = carry + read;
                for (int i = 0; i + Magic.Length <= total; i++)
                {
                    bool hit = true;
                    for (int j = 0; j < Magic.Length; j++)
                    {
                        if (buf[i + j] != Magic[j]) { hit = false; break; }
                    }
                    if (hit) return filePos + i;
                }

                carry = Magic.Length - 1;
                if (carry > total) carry = total;
                Buffer.BlockCopy(buf, total - carry, buf, 0, carry);
                filePos += total - carry;
            }
            return -1;
        }

        /// Resolves an archive entry path inside <root>, refusing anything that
        /// would escape it (defence in depth against crafted archives).
        private static string SafePath(string root, string entryName)
        {
            string rel = entryName.Replace('/', Path.DirectorySeparatorChar);
            if (rel.Trim().Length == 0) return null;
            if (Path.IsPathRooted(rel)) return null;

            string combined = Path.GetFullPath(Path.Combine(root, rel));
            string rootFull = Path.GetFullPath(root);
            string prefix = rootFull.EndsWith(Path.DirectorySeparatorChar.ToString())
                ? rootFull
                : rootFull + Path.DirectorySeparatorChar;

            if (!combined.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;
            return combined;
        }

        private static void CreateShortcut(string linkPath, string targetPath, string workingDir, string description)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) throw new InvalidOperationException("WScript.Shell is unavailable.");

            object shell = Activator.CreateInstance(shellType);
            object link = shellType.InvokeMember(
                "CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { linkPath });

            Type linkType = link.GetType();
            linkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { targetPath });
            linkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { workingDir });
            linkType.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { description });
            linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
        }

        /// Drops an Uninstall.bat next to the app: removes the shortcuts, then
        /// self-deletes the folder from a detached process (a batch file cannot
        /// delete the directory it is currently running from).
        ///
        /// Every path is resolved at install time and baked in literally, so the
        /// generated script never depends on variables from this parent script.
        private static void WriteUninstaller(string target, string desktopLnk, string menuLnk)
        {
            try
            {
                string targetNoSlash = target.TrimEnd(Path.DirectorySeparatorChar);
                string script =
                    "@echo off\r\n" +
                    "title Uninstall - Inter-Varsity Competition Platform\r\n" +
                    "echo Removing the Inter-Varsity Competition Platform...\r\n" +
                    "del /f /q \"" + desktopLnk + "\" >nul 2>&1\r\n" +
                    "del /f /q \"" + menuLnk + "\" >nul 2>&1\r\n" +
                    "set \"STAGE=%TEMP%\\ivp-uninstall-%RANDOM%.cmd\"\r\n" +
                    "> \"%STAGE%\" echo @echo off\r\n" +
                    ">>\"%STAGE%\" echo ping -n 4 127.0.0.1 ^>nul\r\n" +
                    ">>\"%STAGE%\" echo rd /s /q \"" + targetNoSlash + "\"\r\n" +
                    ">>\"%STAGE%\" echo del /f /q \"%STAGE%\"\r\n" +
                    "cd /d \"%TEMP%\"\r\n" +
                    "start \"\" \"%STAGE%\"\r\n" +
                    "exit /b 0\r\n";
                File.WriteAllText(Path.Combine(target, "Uninstall.bat"), script);
            }
            catch
            {
                // Uninstaller is a convenience — never fail the install over it.
            }
        }

        private static string FormatSize(long bytes)
        {
            if (bytes >= 1024L * 1024L * 1024L) return (bytes / (1024.0 * 1024.0 * 1024.0)).ToString("0.00") + " GB";
            if (bytes >= 1024L * 1024L) return (bytes / (1024.0 * 1024.0)).ToString("0.0") + " MB";
            if (bytes >= 1024L) return (bytes / 1024.0).ToString("0.0") + " KB";
            return bytes + " bytes";
        }
    }

    /// Presents <code>[offset, offset+length)</code> of an underlying stream as a
    /// stream that starts at 0. ZIP central-directory offsets are relative to the
    /// archive start, and the End Of Central Directory record sits at the true end
    /// of file — so this maps the appended payload onto exactly the view that
    /// ZipArchive expects, without copying it to a temp file.
    internal sealed class SubRangeStream : Stream
    {
        private readonly Stream _inner;
        private readonly long _start;
        private readonly long _length;
        private long _position;

        public SubRangeStream(Stream inner, long start, long length)
        {
            _inner = inner;
            _start = start;
            _length = length;
            _position = 0;
        }

        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return true; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { return _length; } }

        public override long Position
        {
            get { return _position; }
            set { _position = value; }
        }

        public override void Flush() { }

        public override int Read(byte[] buffer, int offset, int count)
        {
            if (_position >= _length) return 0;
            long remaining = _length - _position;
            if (remaining < count) count = (int)remaining;
            if (count <= 0) return 0;

            _inner.Position = _start + _position;
            int n = _inner.Read(buffer, offset, count);
            _position += n;
            return n;
        }

        public override long Seek(long offset, SeekOrigin origin)
        {
            long next;
            if (origin == SeekOrigin.Begin) next = offset;
            else if (origin == SeekOrigin.Current) next = _position + offset;
            else next = _length + offset;

            if (next < 0) throw new IOException("Cannot seek before the start of the stream.");
            _position = next;
            return _position;
        }

        public override void SetLength(long value) { throw new NotSupportedException(); }
        public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }

        protected override void Dispose(bool disposing)
        {
            // Intentionally does NOT dispose _inner: the caller owns it and still
            // needs it after ZipArchive is closed.
            base.Dispose(disposing);
        }
    }
}
