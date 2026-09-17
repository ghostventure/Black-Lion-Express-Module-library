using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Launcher
{
    [STAThread]
    private static void Main()
    {
        try
        {
            string directory = Path.GetDirectoryName(typeof(Launcher).Assembly.Location);
            string script = Path.Combine(directory, "Start-LionMax.ps1");
            if (!File.Exists(script)) throw new FileNotFoundException("Start-LionMax.ps1 is missing.");
            var info = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"");
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            using (Process process = Process.Start(info))
            {
                process.WaitForExit();
                if (process.ExitCode != 0) throw new Exception("LionMax could not start. See %LOCALAPPDATA%\\LionMax for its logs.");
            }
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "LionMax Universal Logon", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
