using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static int Main(string[] rawArgs)
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string runtime = Path.Combine(baseDir, "DSH-Hub-Runtime.exe");
        if (!File.Exists(runtime))
        {
            MessageBox.Show(
                "找不到 DSH-Hub-Runtime.exe。\n\n请确认解压时保留了完整目录结构，或重新解压发布包。",
                "DSH Hub 无法启动",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 2;
        }

        Environment.SetEnvironmentVariable("ELECTRON_RUN_AS_NODE", null, EnvironmentVariableTarget.Process);

        string arguments = JoinArguments(rawArgs);
        ProcessStartInfo info = new ProcessStartInfo(runtime, arguments);
        info.WorkingDirectory = baseDir;
        info.UseShellExecute = false;
        info.CreateNoWindow = true;

        try
        {
            Process process = Process.Start(info);
            if (process == null)
            {
                MessageBox.Show("无法启动 DSH Hub 运行时。", "DSH Hub", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 3;
            }

            bool waitForExit = false;
            for (int i = 0; i < rawArgs.Length; i++)
            {
                if (String.Equals(rawArgs[i], "--self-test", StringComparison.OrdinalIgnoreCase)
                    || String.Equals(rawArgs[i], "--doctor", StringComparison.OrdinalIgnoreCase))
                {
                    waitForExit = true;
                    break;
                }
            }

            if (waitForExit)
            {
                process.WaitForExit();
                return process.ExitCode;
            }
            return 0;
        }
        catch (Exception ex)
        {
            MessageBox.Show("DSH Hub 启动失败：\n\n" + ex.Message, "DSH Hub", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static string JoinArguments(string[] args)
    {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < args.Length; i++)
        {
            if (i > 0) builder.Append(' ');
            builder.Append(Quote(args[i]));
        }
        return builder.ToString();
    }

    private static string Quote(string value)
    {
        if (value == null) return "\"\"";
        if (value.Length > 0 && value.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0)
        {
            return value;
        }
        StringBuilder builder = new StringBuilder();
        builder.Append('"');
        int backslashes = 0;
        foreach (char c in value)
        {
            if (c == '\\')
            {
                backslashes++;
                continue;
            }
            if (c == '"')
            {
                builder.Append('\\', backslashes * 2 + 1);
                builder.Append('"');
                backslashes = 0;
                continue;
            }
            builder.Append('\\', backslashes);
            backslashes = 0;
            builder.Append(c);
        }
        builder.Append('\\', backslashes * 2);
        builder.Append('"');
        return builder.ToString();
    }
}
