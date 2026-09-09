import 'package:flutter/material.dart';

/// A list of short strings, added one at a time and removed by tapping.
///
/// Shared by foods, allergies and symptoms — four lists with identical
/// behaviour, and four copies of it would be four places for the allergy one
/// to quietly differ from the rest.
///
/// It reports the *whole* list on every change rather than an add or a remove.
/// The server takes a replacement and normalises it, so a diff computed here
/// would be a second opinion about a value the server is about to overwrite.
class TagEditor extends StatefulWidget {
  const TagEditor({
    super.key,
    required this.label,
    required this.hint,
    required this.values,
    required this.onChanged,
    this.help,
  });

  final String label;
  final String hint;
  final String? help;
  final List<String> values;
  final void Function(List<String>) onChanged;

  @override
  State<TagEditor> createState() => _TagEditorState();
}

class _TagEditorState extends State<TagEditor> {
  final _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _add() {
    final tag = _input.text.trim().toLowerCase();
    if (tag.isEmpty) return;
    // Compared lower-cased because that is what the server stores. Without it
    // the member adds `Peanuts`, the server keeps `peanuts`, and the next
    // render shows one entry where they typed two.
    if (widget.values.contains(tag)) {
      _input.clear();
      return;
    }
    widget.onChanged([...widget.values, tag]);
    _input.clear();
  }

  @override
  Widget build(BuildContext context) {
    final help = widget.help;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.label, style: Theme.of(context).textTheme.titleSmall),
          if (help != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(help, style: Theme.of(context).textTheme.bodySmall),
            ),
          const SizedBox(height: 8),

          if (widget.values.isNotEmpty)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: widget.values
                  .map(
                    (tag) => InputChip(
                      label: Text(tag),
                      onDeleted: () => widget.onChanged(
                        widget.values.where((v) => v != tag).toList(),
                      ),
                    ),
                  )
                  .toList(),
            ),

          TextField(
            controller: _input,
            decoration: InputDecoration(
              hintText: widget.hint,
              suffixIcon: IconButton(
                icon: const Icon(Icons.add),
                onPressed: _add,
              ),
            ),
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _add(),
          ),
        ],
      ),
    );
  }
}
