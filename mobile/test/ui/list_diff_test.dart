import 'package:botvy/ui/motion/list_diff.dart';
import 'package:flutter_test/flutter_test.dart';

/// Applies a diff the way AnimatedList is driven — removals by old index
/// from the end, then insertions by new index from the start — and returns
/// the keys the list ends up holding.
List<String> _apply(List<String> before, List<String> after) {
  final diff = diffKeys(before, after);
  final list = [...before];
  for (final i in diff.removed) {
    list.removeAt(i);
  }
  for (final i in diff.inserted) {
    list.insert(i, after[i]);
  }
  return list;
}

void main() {
  test('nothing changed, nothing to do', () {
    final diff = diffKeys(['a', 'b'], ['a', 'b']);
    expect(diff.removed, isEmpty);
    expect(diff.inserted, isEmpty);
  });

  test('an insert and a removal, by index', () {
    final diff = diffKeys(['a', 'b', 'c'], ['a', 'c', 'd']);
    expect(diff.removed, [1]);
    expect(diff.inserted, [2]);
  });

  test('removals come highest first so earlier indices stay valid', () {
    expect(diffKeys(['a', 'b', 'c', 'd'], ['c']).removed, [3, 1, 0]);
  });

  test('the list ends with the new length whatever happened', () {
    for (final (before, after) in [
      (<String>[], ['a', 'b']),
      (['a', 'b'], <String>[]),
      (['a', 'b', 'c'], ['c', 'x', 'a']),
      (['h1', 'a', 'h2', 'b'], ['h1', 'h2', 'b', 'c']),
    ]) {
      expect(_apply(before, after), hasLength(after.length));
    }
  });

  test('a move is neither a removal nor an insertion', () {
    final diff = diffKeys(['a', 'b', 'c'], ['c', 'a', 'b']);
    expect(diff.removed, isEmpty);
    expect(diff.inserted, isEmpty);
  });

  test('duplicate keys are counted, not collapsed', () {
    final diff = diffKeys(['x', 'x', 'y'], ['x', 'y']);
    expect(diff.removed, [1]);
    expect(diff.inserted, isEmpty);
    expect(_apply(['x', 'x', 'y'], ['x', 'y', 'x', 'x']), hasLength(4));
  });
}
