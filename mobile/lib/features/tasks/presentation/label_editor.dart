import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/tasks_cubit.dart';
import 'tasks_page.dart' show parseHexColor;

/// The member's labels, with their open counts.
///
/// The colours on offer come from `settings.labels.palette` — an **operator**
/// knob, fetched and cached by the cubit. A list compiled in here would be a
/// bug by constitution XII: the operator retunes the key and every phone would
/// go on offering whatever somebody typed into a Dart file. A member may also
/// pick a colour of their own, which is why the row stores `#rrggbb` rather
/// than an index into the palette: the palette may change under a label that
/// was already given one of its colours.
class LabelEditorPage extends StatelessWidget {
  const LabelEditorPage({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocBuilder<TasksCubit, TasksState>(
      builder: (context, state) {
        final cubit = context.read<TasksCubit>();
        return Scaffold(
          appBar: AppBar(title: Text(t.labels)),
          floatingActionButton: FloatingActionButton(
            onPressed: () => unawaited(_showLabelSheet(context, cubit, state)),
            child: const Icon(Icons.add),
          ),
          body: state.labels.isEmpty
              ? Center(child: Text(t.labelNoneYet))
              : ListView.builder(
                  itemCount: state.labels.length,
                  itemBuilder: (context, index) {
                    final label = state.labels[index];
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: parseHexColor(label.color),
                        radius: 12,
                      ),
                      title: Text(label.name),
                      subtitle: Text(
                        t.labelOpenCount(state.openCounts[label.id] ?? 0),
                      ),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        tooltip: t.delete,
                        // Its tasks stay, without a label. Taking the tasks
                        // with the label would be the deletion doing far more
                        // than it said.
                        onPressed: () => unawaited(cubit.deleteLabel(label.id)),
                      ),
                      onTap: () => unawaited(
                        _showLabelSheet(context, cubit, state, label: label),
                      ),
                    );
                  },
                ),
        );
      },
    );
  }
}

Future<void> _showLabelSheet(
  BuildContext context,
  TasksCubit cubit,
  TasksState state, {
  LocalLabel? label,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  builder: (_) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
    child: _LabelSheet(cubit: cubit, palette: state.palette, label: label),
  ),
);

class _LabelSheet extends StatefulWidget {
  const _LabelSheet({
    required this.cubit,
    required this.palette,
    this.label,
  });

  final TasksCubit cubit;
  final List<String> palette;
  final LocalLabel? label;

  @override
  State<_LabelSheet> createState() => _LabelSheetState();
}

class _LabelSheetState extends State<_LabelSheet> {
  late final TextEditingController _name = TextEditingController(
    text: widget.label?.name ?? '',
  );
  late final TextEditingController _freeColor = TextEditingController(
    text: widget.label?.color ?? '',
  );
  late String _color = widget.label?.color ?? _firstOffer();

  String _firstOffer() =>
      widget.palette.isNotEmpty ? widget.palette.first : '#475569';

  @override
  void dispose() {
    _name.dispose();
    _freeColor.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _name,
              autofocus: true,
              decoration: InputDecoration(labelText: t.labelName),
            ),
            const SizedBox(height: 16),
            if (widget.palette.isEmpty)
              // No palette to offer: the registry read is admin-only, so a
              // member without that role never learns the key. Said plainly
              // rather than papered over with a compiled-in list, and the free
              // field below still works.
              Text(t.labelNoPalette, style: Theme.of(context).textTheme.bodySmall)
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final offer in widget.palette)
                    GestureDetector(
                      onTap: () => setState(() {
                        _color = offer;
                        _freeColor.text = offer;
                      }),
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: parseHexColor(offer),
                          shape: BoxShape.circle,
                          border: Border.all(
                            width: _color == offer ? 3 : 1,
                            color: Theme.of(context).colorScheme.outline,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            const SizedBox(height: 16),
            TextField(
              controller: _freeColor,
              decoration: InputDecoration(
                labelText: t.labelOwnColour,
                hintText: '#3b82f6',
              ),
              onChanged: (value) {
                // Accepted only once it is a whole colour, so a half-typed
                // `#3b8` does not repaint the swatch as the default grey and
                // look like a rejection.
                if (RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value.trim())) {
                  setState(() => _color = value.trim().toLowerCase());
                }
              },
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                CircleAvatar(backgroundColor: parseHexColor(_color), radius: 14),
                const SizedBox(width: 12),
                Expanded(child: Text(_color)),
              ],
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _save, child: Text(t.save)),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    final navigator = Navigator.of(context);
    final saved = widget.label == null
        ? await widget.cubit.createLabel(_name.text, _color)
        : await widget.cubit.updateLabel(
            widget.label!.id,
            name: _name.text,
            color: _color,
          );
    // A duplicate name is refused, and the sheet stays open on the name the
    // member typed: closing it would make them retype the whole thing to find
    // out what was wrong.
    if (saved) navigator.pop();
  }
}
