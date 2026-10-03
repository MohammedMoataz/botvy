/// What changed between two lists of keys, in the shape `AnimatedList` wants:
/// old indices to remove (highest first, so each removal leaves the rest of
/// the indices valid) and new indices to insert (lowest first).
///
/// Keys present in both lists are kept even if they moved: a move re-renders
/// in place rather than animating out and back in. Keys are counted, so a key
/// that appears twice is two items. Linear in the two lengths — the task list
/// can hold thousands of rows.
class KeyDiff {
  const KeyDiff(this.removed, this.inserted);

  final List<int> removed;
  final List<int> inserted;
}

KeyDiff diffKeys<K>(List<K> before, List<K> after) {
  final wanted = <K, int>{};
  for (final k in after) {
    wanted[k] = (wanted[k] ?? 0) + 1;
  }
  final removed = <int>[];
  final kept = <K, int>{};
  for (var i = 0; i < before.length; i++) {
    final k = before[i];
    final left = wanted[k] ?? 0;
    if (left > 0) {
      wanted[k] = left - 1;
      kept[k] = (kept[k] ?? 0) + 1;
    } else {
      removed.add(i);
    }
  }
  final inserted = <int>[];
  for (var i = 0; i < after.length; i++) {
    final k = after[i];
    final left = kept[k] ?? 0;
    if (left > 0) {
      kept[k] = left - 1;
    } else {
      inserted.add(i);
    }
  }
  return KeyDiff(removed.reversed.toList(), inserted);
}
