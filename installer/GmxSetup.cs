using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class GmxSetup {
    [STAThread]
    private static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var mutex = new Mutex(false, "Local\\GMXPlugin-Einrichtung-" + WindowsIdentity.GetCurrent().User.Value)) {
            bool owned = false;
            try {
                try { owned = mutex.WaitOne(0); } catch (AbandonedMutexException) { owned = true; }
                if (!owned) { MessageBox.Show("Die GMX-Einrichtung ist bereits geöffnet. Bitte das vorhandene Fenster verwenden.", "GMX Plugin"); return; }
                Application.Run(new SetupForm());
            } catch { MessageBox.Show("Die Einrichtung konnte nicht geöffnet werden. Bitte den Installer erneut ausführen.", "GMX Plugin"); }
            finally { if (owned) mutex.ReleaseMutex(); }
        }
    }
}

internal sealed class SetupForm : Form {
    private readonly TextBox mail = new TextBox(), password = new TextBox();
    private readonly Label integration, status;
    private readonly CheckBox verify = new CheckBox(), show = new CheckBox();
    private readonly Button save = new Button(), retry = new Button();
    private bool busy, connected;
    private readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    internal SetupForm() {
        Text = "GMX Plugin einrichten";
        ClientSize = new Size(620, 590); StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
        AutoScaleMode = AutoScaleMode.Dpi; Font = new Font("Segoe UI", 10); BackColor = Color.White;
        var heading = LabelAt("Dein GMX-Konto verbinden", 28, 22, 560, 40);
        heading.Font = new Font("Segoe UI", 19, FontStyle.Bold);
        LabelAt("Einmal einrichten – danach kannst du GMX in Codex verwenden.", 30, 72, 555, 32);
        integration = LabelAt("Codex wird gesucht und das Plugin verbunden …", 30, 115, 555, 66);
        integration.ForeColor = Color.FromArgb(55, 75, 105);
        LabelAt("GMX-E-Mail-Adresse", 30, 190, 550, 25);
        mail.SetBounds(30, 219, 555, 28); mail.TabIndex = 0; mail.AccessibleName = "GMX-E-Mail-Adresse"; Controls.Add(mail);
        LabelAt("App-Passwort / Kennwort", 30, 262, 550, 25);
        password.SetBounds(30, 291, 555, 28); password.UseSystemPasswordChar = true; password.TabIndex = 1; password.AccessibleName = "App-Passwort oder Kennwort"; Controls.Add(password);
        show.Text = "Kennwort anzeigen"; show.SetBounds(30, 326, 250, 28); show.TabIndex = 2;
        show.CheckedChanged += delegate { password.UseSystemPasswordChar = !show.Checked; }; Controls.Add(show);
        verify.Text = "Verbindung nach dem Speichern prüfen"; verify.SetBounds(30, 359, 555, 28); verify.Checked = true; verify.TabIndex = 3;
        verify.CheckedChanged += delegate { save.Text = verify.Checked ? "Speichern und prüfen" : "Lokal speichern"; }; Controls.Add(verify);
        save.Text = "Speichern und prüfen"; save.SetBounds(30, 405, 260, 40); save.TabIndex = 4; Controls.Add(save);
        retry.Text = "Codex erneut verbinden"; retry.SetBounds(305, 405, 280, 40); retry.TabIndex = 5; Controls.Add(retry);
        status = LabelAt("Dein Kennwort bleibt in deiner lokalen, geschützten Kontoablage.", 30, 462, 555, 68);
        status.ForeColor = Color.FromArgb(80, 80, 80);
        LinkAt("GMX: IMAP aktivieren", 30, 548, 195, "https://hilfe.gmx.net/pop-imap/");
        LinkAt("Codex installieren", 230, 548, 180, "https://openai.com/codex/");
        var close = new Button { Text = "Schließen" }; close.SetBounds(465, 540, 120, 34); close.Click += delegate { Close(); }; Controls.Add(close);
        AcceptButton = save; CancelButton = close;
        Shown += async delegate { await Register(); };
        retry.Click += async delegate { await Register(); };
        save.Click += async delegate { await Save(); };
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) { e.Cancel = true; status.Text = "Bitte kurz warten, bis der laufende Schritt beendet ist."; } };
        SetBusy(true);
    }
    private Label LabelAt(string text, int x, int y, int width, int height) {
        var label = new Label { Text = text }; label.SetBounds(x, y, width, height); Controls.Add(label); return label;
    }
    private void LinkAt(string text, int x, int y, int width, string url) {
        var link = new LinkLabel { Text = text }; link.SetBounds(x, y, width, 25);
        link.LinkClicked += delegate { try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { status.Text = "Der Browser konnte nicht geöffnet werden."; } }; Controls.Add(link);
    }
    private void SetBusy(bool value) {
        busy = value; save.Enabled = !value && connected; retry.Enabled = !value;
        mail.Enabled = password.Enabled = show.Enabled = verify.Enabled = !value;
    }
    private async Task Register() {
        SetBusy(true); integration.Text = "Codex wird gesucht und das Plugin verbunden …";
        try {
            var result = await Run("Integration-Codex.ps1", "-Action Register", "");
            connected = result.Code == 0;
            integration.Text = connected ? "✓ Plugin mit Codex verbunden. Gib jetzt dein eigenes GMX-Konto ein." :
                (String.IsNullOrWhiteSpace(result.Error) ? "Codex konnte nicht verbunden werden. Bitte Codex aktualisieren und erneut versuchen." : result.Error.Trim());
            integration.ForeColor = connected ? Color.DarkGreen : Color.Firebrick;
        } catch { connected = false; integration.Text = "Codex konnte nicht verbunden werden. Bitte die Installation erneut prüfen."; }
        finally { SetBusy(false); if (connected) mail.Focus(); }
    }
    private async Task Save() {
        if (!Regex.IsMatch(mail.Text.Trim(), @"^[^\s@]+@[^\s@]+\.[^\s@]+$") || String.IsNullOrWhiteSpace(password.Text)) {
            status.Text = "Bitte eine vollständige E-Mail-Adresse und dein GMX-Kennwort eingeben."; return;
        }
        SetBusy(true); bool check = verify.Checked;
        status.Text = check ? "Konto wird gespeichert und die Anmeldung geprüft. Es wird keine Mail gesendet …" : "Konto wird lokal gespeichert …";
        try {
            string input = new JavaScriptSerializer().Serialize(new { email = mail.Text.Trim(), password = password.Text });
            password.Clear(); show.Checked = false;
            var result = await Run("Setup-Account.ps1", check ? "-CheckConnection" : "", input);
            input = null;
            status.ForeColor = result.Code == 0 ? Color.DarkGreen : Color.Firebrick;
            if (result.Code == 0) status.Text = check ?
                "Fertig! GMX-Anmeldung und Versandverbindung funktionieren. Codex jetzt neu laden. Es wurde keine Mail gesendet." :
                "Konto lokal gespeichert. Die Anmeldung wurde noch nicht geprüft. Codex bitte neu laden.";
            else if (result.Code == 2) status.Text = "Konto gespeichert, aber die Verbindung ist noch nicht bestätigt. Internet, IMAP-Freigabe und App-Passwort prüfen, dann erneut speichern und prüfen.";
            else status.Text = "Konto konnte nicht gespeichert werden. Bitte Eingabe und lokale Ablage prüfen.";
        } catch { status.Text = "Die lokale Einrichtung ist fehlgeschlagen. Bitte den Installer erneut ausführen."; }
        finally { SetBusy(false); }
    }
    private sealed class Result { internal int Code; internal string Error; }
    private Task<Result> Run(string script, string options, string input) {
        return Task.Run(async delegate {
            var info = new ProcessStartInfo {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"),
                Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + Path.Combine(root, "tools", script) + "\" " + options,
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
            };
            using (var process = new Process { StartInfo = info }) {
                process.Start();
                var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
                byte[] bytes = Encoding.UTF8.GetBytes(input);
                process.StandardInput.BaseStream.Write(bytes, 0, bytes.Length); process.StandardInput.BaseStream.Flush();
                Array.Clear(bytes, 0, bytes.Length); process.StandardInput.Close();
                if (!process.WaitForExit(100000)) { process.Kill(); throw new TimeoutException(); }
                await output;
                return new Result { Code = process.ExitCode, Error = await error };
            }
        });
    }
}
