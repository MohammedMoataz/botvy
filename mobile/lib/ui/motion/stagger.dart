import 'package:flutter/material.dart';

import '../../app/tokens.dart';

/// A page's cards entering one after another — once, on the page's first
/// paint. A refresh, a new card or a rebuild does not replay it: an entrance
/// is for arriving, not for every change.
///
/// [StaggerScope] owns one controller for the page; each [StaggerItem] takes
/// its slice of it, 40 ms after the one before, fading in and rising a little.
class StaggerScope extends StatefulWidget {
  const StaggerScope({super.key, required this.child});

  final Widget child;

  @override
  State<StaggerScope> createState() => _StaggerScopeState();
}

class _StaggerScopeState extends State<StaggerScope>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: BotvyMotion.long,
  );
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (BotvyMotion.of(context).enabled) {
      _controller.forward();
    } else {
      _controller.value = 1;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _Stagger(animation: _controller, child: widget.child);
}

class _Stagger extends InheritedWidget {
  const _Stagger({required this.animation, required super.child});

  final Animation<double> animation;

  @override
  bool updateShouldNotify(_Stagger old) => old.animation != animation;
}

class StaggerItem extends StatefulWidget {
  const StaggerItem({super.key, required this.index, required this.child});

  final int index;
  final Widget child;

  /// Each card starts this far into the scope's run after the previous one.
  static const double _step = 0.1;

  @override
  State<StaggerItem> createState() => _StaggerItemState();
}

class _StaggerItemState extends State<StaggerItem> {
  // Held and disposed here: a CurvedAnimation registers a listener on the
  // scope's controller, and one built per `build` would add another on every
  // rebuild of the page — Home rebuilds on every cubit emit.
  CurvedAnimation? _animation;
  Animation<double>? _parent;
  int? _index;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(StaggerItem old) {
    super.didUpdateWidget(old);
    _sync();
  }

  void _sync() {
    final parent = context
        .dependOnInheritedWidgetOfExactType<_Stagger>()
        ?.animation;
    if (parent == _parent && widget.index == _index) return;
    _animation?.dispose();
    _parent = parent;
    _index = widget.index;
    if (parent == null) {
      _animation = null;
      return;
    }
    final start = (widget.index * StaggerItem._step).clamp(0.0, 0.6);
    _animation = CurvedAnimation(
      parent: parent,
      curve: Interval(start, start + 0.4, curve: BotvyMotion.enter),
    );
  }

  @override
  void dispose() {
    _animation?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final animation = _animation;
    if (animation == null) return widget.child;
    return FadeTransition(
      opacity: animation,
      child: SlideTransition(
        position: Tween(
          begin: const Offset(0, 0.04),
          end: Offset.zero,
        ).animate(animation),
        child: widget.child,
      ),
    );
  }
}
