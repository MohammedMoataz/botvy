import 'package:flutter/material.dart';

/// The four rows a settings screen is made of. Each is a whole-row tap
/// target (≥ 48 dp, Material's `ListTile` minimum) with a leading icon.

/// Opens somewhere else. The chevron mirrors in Arabic by itself
/// (`Icons.chevron_right` matches the text direction).
class NavTile extends StatelessWidget {
  const NavTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon),
    title: Text(title),
    subtitle: subtitle == null ? null : Text(subtitle!),
    trailing: const Icon(Icons.chevron_right),
    onTap: onTap,
  );
}

/// On or off.
class SwitchTile extends StatelessWidget {
  const SwitchTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) => SwitchListTile(
    secondary: Icon(icon),
    title: Text(title),
    subtitle: subtitle == null ? null : Text(subtitle!),
    value: value,
    onChanged: onChanged,
  );
}

/// One of a few: shows the current choice and opens a dialog of the rest.
class ChoiceTile<T> extends StatelessWidget {
  const ChoiceTile({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final T value;

  /// Value → label, in display order.
  final Map<T, String> options;
  final ValueChanged<T> onChanged;

  Future<void> _pick(BuildContext context) async {
    final picked = await showDialog<T>(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text(title),
        children: [
          RadioGroup<T>(
            groupValue: value,
            onChanged: (v) => Navigator.of(context).pop(v),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final entry in options.entries)
                  RadioListTile<T>(value: entry.key, title: Text(entry.value)),
              ],
            ),
          ),
        ],
      ),
    );
    if (picked != null && picked != value) onChanged(picked);
  }

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon),
    title: Text(title),
    subtitle: Text(options[value] ?? ''),
    trailing: const Icon(Icons.chevron_right),
    onTap: () => _pick(context),
  );
}

/// Destructive: sign out, delete. In the error colour; the caller confirms.
class DangerTile extends StatelessWidget {
  const DangerTile({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final error = Theme.of(context).colorScheme.error;
    return ListTile(
      leading: Icon(icon, color: error),
      title: Text(title, style: TextStyle(color: error)),
      onTap: onTap,
    );
  }
}
