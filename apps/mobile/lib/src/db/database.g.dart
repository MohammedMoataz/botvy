// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $RemindersTable extends Reminders
    with TableInfo<$RemindersTable, LocalReminder> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RemindersTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _clientIdMeta =
      const VerificationMeta('clientId');
  @override
  late final GeneratedColumn<String> clientId = GeneratedColumn<String>(
      'client_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
      'title', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _remindAtMeta =
      const VerificationMeta('remindAt');
  @override
  late final GeneratedColumn<DateTime> remindAt = GeneratedColumn<DateTime>(
      'remind_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('active'));
  static const VerificationMeta _leadTimesMeta =
      const VerificationMeta('leadTimes');
  @override
  late final GeneratedColumn<String> leadTimes = GeneratedColumn<String>(
      'lead_times', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('["1h","0m"]'));
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _baseUpdatedAtMeta =
      const VerificationMeta('baseUpdatedAt');
  @override
  late final GeneratedColumn<DateTime> baseUpdatedAt =
      GeneratedColumn<DateTime>('base_updated_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _deletedAtMeta =
      const VerificationMeta('deletedAt');
  @override
  late final GeneratedColumn<DateTime> deletedAt = GeneratedColumn<DateTime>(
      'deleted_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _pendingOpMeta =
      const VerificationMeta('pendingOp');
  @override
  late final GeneratedColumn<String> pendingOp = GeneratedColumn<String>(
      'pending_op', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _pushAttemptsMeta =
      const VerificationMeta('pushAttempts');
  @override
  late final GeneratedColumn<int> pushAttempts = GeneratedColumn<int>(
      'push_attempts', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  @override
  List<GeneratedColumn> get $columns => [
        id,
        clientId,
        title,
        remindAt,
        status,
        leadTimes,
        updatedAt,
        baseUpdatedAt,
        deletedAt,
        pendingOp,
        pushAttempts
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'reminders';
  @override
  VerificationContext validateIntegrity(Insertable<LocalReminder> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('client_id')) {
      context.handle(_clientIdMeta,
          clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta));
    }
    if (data.containsKey('title')) {
      context.handle(
          _titleMeta, title.isAcceptableOrUnknown(data['title']!, _titleMeta));
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('remind_at')) {
      context.handle(_remindAtMeta,
          remindAt.isAcceptableOrUnknown(data['remind_at']!, _remindAtMeta));
    } else if (isInserting) {
      context.missing(_remindAtMeta);
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    if (data.containsKey('lead_times')) {
      context.handle(_leadTimesMeta,
          leadTimes.isAcceptableOrUnknown(data['lead_times']!, _leadTimesMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    }
    if (data.containsKey('base_updated_at')) {
      context.handle(
          _baseUpdatedAtMeta,
          baseUpdatedAt.isAcceptableOrUnknown(
              data['base_updated_at']!, _baseUpdatedAtMeta));
    }
    if (data.containsKey('deleted_at')) {
      context.handle(_deletedAtMeta,
          deletedAt.isAcceptableOrUnknown(data['deleted_at']!, _deletedAtMeta));
    }
    if (data.containsKey('pending_op')) {
      context.handle(_pendingOpMeta,
          pendingOp.isAcceptableOrUnknown(data['pending_op']!, _pendingOpMeta));
    }
    if (data.containsKey('push_attempts')) {
      context.handle(
          _pushAttemptsMeta,
          pushAttempts.isAcceptableOrUnknown(
              data['push_attempts']!, _pushAttemptsMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalReminder map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalReminder(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      clientId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}client_id']),
      title: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}title'])!,
      remindAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}remind_at'])!,
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      leadTimes: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}lead_times'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']),
      baseUpdatedAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}base_updated_at']),
      deletedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}deleted_at']),
      pendingOp: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}pending_op']),
      pushAttempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}push_attempts'])!,
    );
  }

  @override
  $RemindersTable createAlias(String alias) {
    return $RemindersTable(attachedDatabase, alias);
  }
}

class LocalReminder extends DataClass implements Insertable<LocalReminder> {
  /// Server id once known; until then the clientId, so rows are stable across
  /// the create round-trip and local alarms do not have to be renumbered.
  final String id;
  final String? clientId;
  final String title;
  final DateTime remindAt;
  final String status;

  /// JSON array of offsets, e.g. ["1h","0m"].
  final String leadTimes;

  /// When this device last changed the row. Drives outbox ordering and the
  /// newest-wins comparison.
  final DateTime? updatedAt;

  /// The server's own `updatedAt` for the last version this device pulled —
  /// deliberately *not* the same thing as [updatedAt], and never written by a
  /// local edit.
  ///
  /// The gateway accepts a push outright when this still matches its row,
  /// which is the ordinary case and consults no clock at all. Sending the
  /// local edit time here instead would never match, so every offline edit
  /// would fall through to a clock comparison and a handset running slow
  /// would lose all of them.
  final DateTime? baseUpdatedAt;

  /// Set when the reminder has been deleted. The row stays: it is what the
  /// Deleted view lists and what Restore undoes. Cleared on the server's
  /// horizon, when a full snapshot stops carrying it.
  final DateTime? deletedAt;

  /// Null once the server agrees with this row.
  final String? pendingOp;

  /// How many times the server has refused this row. A rejected edit keeps its
  /// `pendingOp` forever rather than being discarded, but stops being re-sent
  /// after a few tries so one poisoned row cannot block the whole outbox.
  final int pushAttempts;
  const LocalReminder(
      {required this.id,
      this.clientId,
      required this.title,
      required this.remindAt,
      required this.status,
      required this.leadTimes,
      this.updatedAt,
      this.baseUpdatedAt,
      this.deletedAt,
      this.pendingOp,
      required this.pushAttempts});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || clientId != null) {
      map['client_id'] = Variable<String>(clientId);
    }
    map['title'] = Variable<String>(title);
    map['remind_at'] = Variable<DateTime>(remindAt);
    map['status'] = Variable<String>(status);
    map['lead_times'] = Variable<String>(leadTimes);
    if (!nullToAbsent || updatedAt != null) {
      map['updated_at'] = Variable<DateTime>(updatedAt);
    }
    if (!nullToAbsent || baseUpdatedAt != null) {
      map['base_updated_at'] = Variable<DateTime>(baseUpdatedAt);
    }
    if (!nullToAbsent || deletedAt != null) {
      map['deleted_at'] = Variable<DateTime>(deletedAt);
    }
    if (!nullToAbsent || pendingOp != null) {
      map['pending_op'] = Variable<String>(pendingOp);
    }
    map['push_attempts'] = Variable<int>(pushAttempts);
    return map;
  }

  RemindersCompanion toCompanion(bool nullToAbsent) {
    return RemindersCompanion(
      id: Value(id),
      clientId: clientId == null && nullToAbsent
          ? const Value.absent()
          : Value(clientId),
      title: Value(title),
      remindAt: Value(remindAt),
      status: Value(status),
      leadTimes: Value(leadTimes),
      updatedAt: updatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(updatedAt),
      baseUpdatedAt: baseUpdatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(baseUpdatedAt),
      deletedAt: deletedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(deletedAt),
      pendingOp: pendingOp == null && nullToAbsent
          ? const Value.absent()
          : Value(pendingOp),
      pushAttempts: Value(pushAttempts),
    );
  }

  factory LocalReminder.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalReminder(
      id: serializer.fromJson<String>(json['id']),
      clientId: serializer.fromJson<String?>(json['clientId']),
      title: serializer.fromJson<String>(json['title']),
      remindAt: serializer.fromJson<DateTime>(json['remindAt']),
      status: serializer.fromJson<String>(json['status']),
      leadTimes: serializer.fromJson<String>(json['leadTimes']),
      updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'clientId': serializer.toJson<String?>(clientId),
      'title': serializer.toJson<String>(title),
      'remindAt': serializer.toJson<DateTime>(remindAt),
      'status': serializer.toJson<String>(status),
      'leadTimes': serializer.toJson<String>(leadTimes),
      'updatedAt': serializer.toJson<DateTime?>(updatedAt),
      'baseUpdatedAt': serializer.toJson<DateTime?>(baseUpdatedAt),
      'deletedAt': serializer.toJson<DateTime?>(deletedAt),
      'pendingOp': serializer.toJson<String?>(pendingOp),
      'pushAttempts': serializer.toJson<int>(pushAttempts),
    };
  }

  LocalReminder copyWith(
          {String? id,
          Value<String?> clientId = const Value.absent(),
          String? title,
          DateTime? remindAt,
          String? status,
          String? leadTimes,
          Value<DateTime?> updatedAt = const Value.absent(),
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<DateTime?> deletedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts}) =>
      LocalReminder(
        id: id ?? this.id,
        clientId: clientId.present ? clientId.value : this.clientId,
        title: title ?? this.title,
        remindAt: remindAt ?? this.remindAt,
        status: status ?? this.status,
        leadTimes: leadTimes ?? this.leadTimes,
        updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
      );
  LocalReminder copyWithCompanion(RemindersCompanion data) {
    return LocalReminder(
      id: data.id.present ? data.id.value : this.id,
      clientId: data.clientId.present ? data.clientId.value : this.clientId,
      title: data.title.present ? data.title.value : this.title,
      remindAt: data.remindAt.present ? data.remindAt.value : this.remindAt,
      status: data.status.present ? data.status.value : this.status,
      leadTimes: data.leadTimes.present ? data.leadTimes.value : this.leadTimes,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      baseUpdatedAt: data.baseUpdatedAt.present
          ? data.baseUpdatedAt.value
          : this.baseUpdatedAt,
      deletedAt: data.deletedAt.present ? data.deletedAt.value : this.deletedAt,
      pendingOp: data.pendingOp.present ? data.pendingOp.value : this.pendingOp,
      pushAttempts: data.pushAttempts.present
          ? data.pushAttempts.value
          : this.pushAttempts,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalReminder(')
          ..write('id: $id, ')
          ..write('clientId: $clientId, ')
          ..write('title: $title, ')
          ..write('remindAt: $remindAt, ')
          ..write('status: $status, ')
          ..write('leadTimes: $leadTimes, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, clientId, title, remindAt, status,
      leadTimes, updatedAt, baseUpdatedAt, deletedAt, pendingOp, pushAttempts);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalReminder &&
          other.id == this.id &&
          other.clientId == this.clientId &&
          other.title == this.title &&
          other.remindAt == this.remindAt &&
          other.status == this.status &&
          other.leadTimes == this.leadTimes &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.deletedAt == this.deletedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts);
}

class RemindersCompanion extends UpdateCompanion<LocalReminder> {
  final Value<String> id;
  final Value<String?> clientId;
  final Value<String> title;
  final Value<DateTime> remindAt;
  final Value<String> status;
  final Value<String> leadTimes;
  final Value<DateTime?> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<DateTime?> deletedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<int> rowid;
  const RemindersCompanion({
    this.id = const Value.absent(),
    this.clientId = const Value.absent(),
    this.title = const Value.absent(),
    this.remindAt = const Value.absent(),
    this.status = const Value.absent(),
    this.leadTimes = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RemindersCompanion.insert({
    required String id,
    this.clientId = const Value.absent(),
    required String title,
    required DateTime remindAt,
    this.status = const Value.absent(),
    this.leadTimes = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        title = Value(title),
        remindAt = Value(remindAt);
  static Insertable<LocalReminder> custom({
    Expression<String>? id,
    Expression<String>? clientId,
    Expression<String>? title,
    Expression<DateTime>? remindAt,
    Expression<String>? status,
    Expression<String>? leadTimes,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<DateTime>? deletedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (clientId != null) 'client_id': clientId,
      if (title != null) 'title': title,
      if (remindAt != null) 'remind_at': remindAt,
      if (status != null) 'status': status,
      if (leadTimes != null) 'lead_times': leadTimes,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (baseUpdatedAt != null) 'base_updated_at': baseUpdatedAt,
      if (deletedAt != null) 'deleted_at': deletedAt,
      if (pendingOp != null) 'pending_op': pendingOp,
      if (pushAttempts != null) 'push_attempts': pushAttempts,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RemindersCompanion copyWith(
      {Value<String>? id,
      Value<String?>? clientId,
      Value<String>? title,
      Value<DateTime>? remindAt,
      Value<String>? status,
      Value<String>? leadTimes,
      Value<DateTime?>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<DateTime?>? deletedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<int>? rowid}) {
    return RemindersCompanion(
      id: id ?? this.id,
      clientId: clientId ?? this.clientId,
      title: title ?? this.title,
      remindAt: remindAt ?? this.remindAt,
      status: status ?? this.status,
      leadTimes: leadTimes ?? this.leadTimes,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      deletedAt: deletedAt ?? this.deletedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (clientId.present) {
      map['client_id'] = Variable<String>(clientId.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (remindAt.present) {
      map['remind_at'] = Variable<DateTime>(remindAt.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (leadTimes.present) {
      map['lead_times'] = Variable<String>(leadTimes.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (baseUpdatedAt.present) {
      map['base_updated_at'] = Variable<DateTime>(baseUpdatedAt.value);
    }
    if (deletedAt.present) {
      map['deleted_at'] = Variable<DateTime>(deletedAt.value);
    }
    if (pendingOp.present) {
      map['pending_op'] = Variable<String>(pendingOp.value);
    }
    if (pushAttempts.present) {
      map['push_attempts'] = Variable<int>(pushAttempts.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RemindersCompanion(')
          ..write('id: $id, ')
          ..write('clientId: $clientId, ')
          ..write('title: $title, ')
          ..write('remindAt: $remindAt, ')
          ..write('status: $status, ')
          ..write('leadTimes: $leadTimes, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ReminderPingsTable extends ReminderPings
    with TableInfo<$ReminderPingsTable, LocalPing> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ReminderPingsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _reminderIdMeta =
      const VerificationMeta('reminderId');
  @override
  late final GeneratedColumn<String> reminderId = GeneratedColumn<String>(
      'reminder_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _notifyAtMeta =
      const VerificationMeta('notifyAt');
  @override
  late final GeneratedColumn<DateTime> notifyAt = GeneratedColumn<DateTime>(
      'notify_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _labelMeta = const VerificationMeta('label');
  @override
  late final GeneratedColumn<String> label = GeneratedColumn<String>(
      'label', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sentAtMeta = const VerificationMeta('sentAt');
  @override
  late final GeneratedColumn<DateTime> sentAt = GeneratedColumn<DateTime>(
      'sent_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns =>
      [id, reminderId, notifyAt, label, sentAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'reminder_pings';
  @override
  VerificationContext validateIntegrity(Insertable<LocalPing> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('reminder_id')) {
      context.handle(
          _reminderIdMeta,
          reminderId.isAcceptableOrUnknown(
              data['reminder_id']!, _reminderIdMeta));
    } else if (isInserting) {
      context.missing(_reminderIdMeta);
    }
    if (data.containsKey('notify_at')) {
      context.handle(_notifyAtMeta,
          notifyAt.isAcceptableOrUnknown(data['notify_at']!, _notifyAtMeta));
    } else if (isInserting) {
      context.missing(_notifyAtMeta);
    }
    if (data.containsKey('label')) {
      context.handle(
          _labelMeta, label.isAcceptableOrUnknown(data['label']!, _labelMeta));
    } else if (isInserting) {
      context.missing(_labelMeta);
    }
    if (data.containsKey('sent_at')) {
      context.handle(_sentAtMeta,
          sentAt.isAcceptableOrUnknown(data['sent_at']!, _sentAtMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalPing map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalPing(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      reminderId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}reminder_id'])!,
      notifyAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}notify_at'])!,
      label: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}label'])!,
      sentAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}sent_at']),
    );
  }

  @override
  $ReminderPingsTable createAlias(String alias) {
    return $ReminderPingsTable(attachedDatabase, alias);
  }
}

class LocalPing extends DataClass implements Insertable<LocalPing> {
  final String id;
  final String reminderId;
  final DateTime notifyAt;
  final String label;
  final DateTime? sentAt;
  const LocalPing(
      {required this.id,
      required this.reminderId,
      required this.notifyAt,
      required this.label,
      this.sentAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['reminder_id'] = Variable<String>(reminderId);
    map['notify_at'] = Variable<DateTime>(notifyAt);
    map['label'] = Variable<String>(label);
    if (!nullToAbsent || sentAt != null) {
      map['sent_at'] = Variable<DateTime>(sentAt);
    }
    return map;
  }

  ReminderPingsCompanion toCompanion(bool nullToAbsent) {
    return ReminderPingsCompanion(
      id: Value(id),
      reminderId: Value(reminderId),
      notifyAt: Value(notifyAt),
      label: Value(label),
      sentAt:
          sentAt == null && nullToAbsent ? const Value.absent() : Value(sentAt),
    );
  }

  factory LocalPing.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalPing(
      id: serializer.fromJson<String>(json['id']),
      reminderId: serializer.fromJson<String>(json['reminderId']),
      notifyAt: serializer.fromJson<DateTime>(json['notifyAt']),
      label: serializer.fromJson<String>(json['label']),
      sentAt: serializer.fromJson<DateTime?>(json['sentAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'reminderId': serializer.toJson<String>(reminderId),
      'notifyAt': serializer.toJson<DateTime>(notifyAt),
      'label': serializer.toJson<String>(label),
      'sentAt': serializer.toJson<DateTime?>(sentAt),
    };
  }

  LocalPing copyWith(
          {String? id,
          String? reminderId,
          DateTime? notifyAt,
          String? label,
          Value<DateTime?> sentAt = const Value.absent()}) =>
      LocalPing(
        id: id ?? this.id,
        reminderId: reminderId ?? this.reminderId,
        notifyAt: notifyAt ?? this.notifyAt,
        label: label ?? this.label,
        sentAt: sentAt.present ? sentAt.value : this.sentAt,
      );
  LocalPing copyWithCompanion(ReminderPingsCompanion data) {
    return LocalPing(
      id: data.id.present ? data.id.value : this.id,
      reminderId:
          data.reminderId.present ? data.reminderId.value : this.reminderId,
      notifyAt: data.notifyAt.present ? data.notifyAt.value : this.notifyAt,
      label: data.label.present ? data.label.value : this.label,
      sentAt: data.sentAt.present ? data.sentAt.value : this.sentAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalPing(')
          ..write('id: $id, ')
          ..write('reminderId: $reminderId, ')
          ..write('notifyAt: $notifyAt, ')
          ..write('label: $label, ')
          ..write('sentAt: $sentAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, reminderId, notifyAt, label, sentAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalPing &&
          other.id == this.id &&
          other.reminderId == this.reminderId &&
          other.notifyAt == this.notifyAt &&
          other.label == this.label &&
          other.sentAt == this.sentAt);
}

class ReminderPingsCompanion extends UpdateCompanion<LocalPing> {
  final Value<String> id;
  final Value<String> reminderId;
  final Value<DateTime> notifyAt;
  final Value<String> label;
  final Value<DateTime?> sentAt;
  final Value<int> rowid;
  const ReminderPingsCompanion({
    this.id = const Value.absent(),
    this.reminderId = const Value.absent(),
    this.notifyAt = const Value.absent(),
    this.label = const Value.absent(),
    this.sentAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ReminderPingsCompanion.insert({
    required String id,
    required String reminderId,
    required DateTime notifyAt,
    required String label,
    this.sentAt = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        reminderId = Value(reminderId),
        notifyAt = Value(notifyAt),
        label = Value(label);
  static Insertable<LocalPing> custom({
    Expression<String>? id,
    Expression<String>? reminderId,
    Expression<DateTime>? notifyAt,
    Expression<String>? label,
    Expression<DateTime>? sentAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (reminderId != null) 'reminder_id': reminderId,
      if (notifyAt != null) 'notify_at': notifyAt,
      if (label != null) 'label': label,
      if (sentAt != null) 'sent_at': sentAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ReminderPingsCompanion copyWith(
      {Value<String>? id,
      Value<String>? reminderId,
      Value<DateTime>? notifyAt,
      Value<String>? label,
      Value<DateTime?>? sentAt,
      Value<int>? rowid}) {
    return ReminderPingsCompanion(
      id: id ?? this.id,
      reminderId: reminderId ?? this.reminderId,
      notifyAt: notifyAt ?? this.notifyAt,
      label: label ?? this.label,
      sentAt: sentAt ?? this.sentAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (reminderId.present) {
      map['reminder_id'] = Variable<String>(reminderId.value);
    }
    if (notifyAt.present) {
      map['notify_at'] = Variable<DateTime>(notifyAt.value);
    }
    if (label.present) {
      map['label'] = Variable<String>(label.value);
    }
    if (sentAt.present) {
      map['sent_at'] = Variable<DateTime>(sentAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ReminderPingsCompanion(')
          ..write('id: $id, ')
          ..write('reminderId: $reminderId, ')
          ..write('notifyAt: $notifyAt, ')
          ..write('label: $label, ')
          ..write('sentAt: $sentAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ConversationsTable extends Conversations
    with TableInfo<$ConversationsTable, LocalConversation> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ConversationsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
      'title', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _pinnedMeta = const VerificationMeta('pinned');
  @override
  late final GeneratedColumn<bool> pinned = GeneratedColumn<bool>(
      'pinned', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("pinned" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _archivedMeta =
      const VerificationMeta('archived');
  @override
  late final GeneratedColumn<bool> archived = GeneratedColumn<bool>(
      'archived', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("archived" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _isCoachingMeta =
      const VerificationMeta('isCoaching');
  @override
  late final GeneratedColumn<bool> isCoaching = GeneratedColumn<bool>(
      'is_coaching', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("is_coaching" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _lastMessageAtMeta =
      const VerificationMeta('lastMessageAt');
  @override
  late final GeneratedColumn<DateTime> lastMessageAt =
      GeneratedColumn<DateTime>('last_message_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _baseUpdatedAtMeta =
      const VerificationMeta('baseUpdatedAt');
  @override
  late final GeneratedColumn<DateTime> baseUpdatedAt =
      GeneratedColumn<DateTime>('base_updated_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _pendingOpMeta =
      const VerificationMeta('pendingOp');
  @override
  late final GeneratedColumn<String> pendingOp = GeneratedColumn<String>(
      'pending_op', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _pushAttemptsMeta =
      const VerificationMeta('pushAttempts');
  @override
  late final GeneratedColumn<int> pushAttempts = GeneratedColumn<int>(
      'push_attempts', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  @override
  List<GeneratedColumn> get $columns => [
        id,
        title,
        pinned,
        archived,
        isCoaching,
        lastMessageAt,
        updatedAt,
        baseUpdatedAt,
        pendingOp,
        pushAttempts
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'conversations';
  @override
  VerificationContext validateIntegrity(Insertable<LocalConversation> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
          _titleMeta, title.isAcceptableOrUnknown(data['title']!, _titleMeta));
    }
    if (data.containsKey('pinned')) {
      context.handle(_pinnedMeta,
          pinned.isAcceptableOrUnknown(data['pinned']!, _pinnedMeta));
    }
    if (data.containsKey('archived')) {
      context.handle(_archivedMeta,
          archived.isAcceptableOrUnknown(data['archived']!, _archivedMeta));
    }
    if (data.containsKey('is_coaching')) {
      context.handle(
          _isCoachingMeta,
          isCoaching.isAcceptableOrUnknown(
              data['is_coaching']!, _isCoachingMeta));
    }
    if (data.containsKey('last_message_at')) {
      context.handle(
          _lastMessageAtMeta,
          lastMessageAt.isAcceptableOrUnknown(
              data['last_message_at']!, _lastMessageAtMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    }
    if (data.containsKey('base_updated_at')) {
      context.handle(
          _baseUpdatedAtMeta,
          baseUpdatedAt.isAcceptableOrUnknown(
              data['base_updated_at']!, _baseUpdatedAtMeta));
    }
    if (data.containsKey('pending_op')) {
      context.handle(_pendingOpMeta,
          pendingOp.isAcceptableOrUnknown(data['pending_op']!, _pendingOpMeta));
    }
    if (data.containsKey('push_attempts')) {
      context.handle(
          _pushAttemptsMeta,
          pushAttempts.isAcceptableOrUnknown(
              data['push_attempts']!, _pushAttemptsMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalConversation map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalConversation(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      title: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}title'])!,
      pinned: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}pinned'])!,
      archived: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}archived'])!,
      isCoaching: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}is_coaching'])!,
      lastMessageAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}last_message_at']),
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']),
      baseUpdatedAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}base_updated_at']),
      pendingOp: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}pending_op']),
      pushAttempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}push_attempts'])!,
    );
  }

  @override
  $ConversationsTable createAlias(String alias) {
    return $ConversationsTable(attachedDatabase, alias);
  }
}

class LocalConversation extends DataClass
    implements Insertable<LocalConversation> {
  /// Minted by whichever side creates it, and the gateway accepts the phone's
  /// uuid as the row's own id. That is what lets a message name its chat the
  /// instant the user opens one, with no network and no create round trip.
  final String id;

  /// Empty until the user renames it. The list shows the first message instead,
  /// so no auto-title is ever written and none can collide with a rename.
  final String title;
  final bool pinned;
  final bool archived;

  /// True for the one chat the nightly check-in and program land in. It is also
  /// where a message with no chat of its own is shown.
  final bool isCoaching;

  /// Newest activity, which is what the list is ordered by. Kept apart from
  /// [updatedAt]: that is an *edit* time and drives the outbox, so bumping it
  /// on every message would make every send look like a pending push.
  final DateTime? lastMessageAt;
  final DateTime? updatedAt;

  /// The server's own timestamp for the last version pulled, never written by a
  /// local edit — the same contract as [Reminders.baseUpdatedAt]. Null also
  /// means the server has never sent this row, which is how a local delete
  /// knows there is nothing to tell the gateway about.
  final DateTime? baseUpdatedAt;
  final String? pendingOp;
  final int pushAttempts;
  const LocalConversation(
      {required this.id,
      required this.title,
      required this.pinned,
      required this.archived,
      required this.isCoaching,
      this.lastMessageAt,
      this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['title'] = Variable<String>(title);
    map['pinned'] = Variable<bool>(pinned);
    map['archived'] = Variable<bool>(archived);
    map['is_coaching'] = Variable<bool>(isCoaching);
    if (!nullToAbsent || lastMessageAt != null) {
      map['last_message_at'] = Variable<DateTime>(lastMessageAt);
    }
    if (!nullToAbsent || updatedAt != null) {
      map['updated_at'] = Variable<DateTime>(updatedAt);
    }
    if (!nullToAbsent || baseUpdatedAt != null) {
      map['base_updated_at'] = Variable<DateTime>(baseUpdatedAt);
    }
    if (!nullToAbsent || pendingOp != null) {
      map['pending_op'] = Variable<String>(pendingOp);
    }
    map['push_attempts'] = Variable<int>(pushAttempts);
    return map;
  }

  ConversationsCompanion toCompanion(bool nullToAbsent) {
    return ConversationsCompanion(
      id: Value(id),
      title: Value(title),
      pinned: Value(pinned),
      archived: Value(archived),
      isCoaching: Value(isCoaching),
      lastMessageAt: lastMessageAt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastMessageAt),
      updatedAt: updatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(updatedAt),
      baseUpdatedAt: baseUpdatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(baseUpdatedAt),
      pendingOp: pendingOp == null && nullToAbsent
          ? const Value.absent()
          : Value(pendingOp),
      pushAttempts: Value(pushAttempts),
    );
  }

  factory LocalConversation.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalConversation(
      id: serializer.fromJson<String>(json['id']),
      title: serializer.fromJson<String>(json['title']),
      pinned: serializer.fromJson<bool>(json['pinned']),
      archived: serializer.fromJson<bool>(json['archived']),
      isCoaching: serializer.fromJson<bool>(json['isCoaching']),
      lastMessageAt: serializer.fromJson<DateTime?>(json['lastMessageAt']),
      updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'title': serializer.toJson<String>(title),
      'pinned': serializer.toJson<bool>(pinned),
      'archived': serializer.toJson<bool>(archived),
      'isCoaching': serializer.toJson<bool>(isCoaching),
      'lastMessageAt': serializer.toJson<DateTime?>(lastMessageAt),
      'updatedAt': serializer.toJson<DateTime?>(updatedAt),
      'baseUpdatedAt': serializer.toJson<DateTime?>(baseUpdatedAt),
      'pendingOp': serializer.toJson<String?>(pendingOp),
      'pushAttempts': serializer.toJson<int>(pushAttempts),
    };
  }

  LocalConversation copyWith(
          {String? id,
          String? title,
          bool? pinned,
          bool? archived,
          bool? isCoaching,
          Value<DateTime?> lastMessageAt = const Value.absent(),
          Value<DateTime?> updatedAt = const Value.absent(),
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts}) =>
      LocalConversation(
        id: id ?? this.id,
        title: title ?? this.title,
        pinned: pinned ?? this.pinned,
        archived: archived ?? this.archived,
        isCoaching: isCoaching ?? this.isCoaching,
        lastMessageAt:
            lastMessageAt.present ? lastMessageAt.value : this.lastMessageAt,
        updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
      );
  LocalConversation copyWithCompanion(ConversationsCompanion data) {
    return LocalConversation(
      id: data.id.present ? data.id.value : this.id,
      title: data.title.present ? data.title.value : this.title,
      pinned: data.pinned.present ? data.pinned.value : this.pinned,
      archived: data.archived.present ? data.archived.value : this.archived,
      isCoaching:
          data.isCoaching.present ? data.isCoaching.value : this.isCoaching,
      lastMessageAt: data.lastMessageAt.present
          ? data.lastMessageAt.value
          : this.lastMessageAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      baseUpdatedAt: data.baseUpdatedAt.present
          ? data.baseUpdatedAt.value
          : this.baseUpdatedAt,
      pendingOp: data.pendingOp.present ? data.pendingOp.value : this.pendingOp,
      pushAttempts: data.pushAttempts.present
          ? data.pushAttempts.value
          : this.pushAttempts,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalConversation(')
          ..write('id: $id, ')
          ..write('title: $title, ')
          ..write('pinned: $pinned, ')
          ..write('archived: $archived, ')
          ..write('isCoaching: $isCoaching, ')
          ..write('lastMessageAt: $lastMessageAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, title, pinned, archived, isCoaching,
      lastMessageAt, updatedAt, baseUpdatedAt, pendingOp, pushAttempts);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalConversation &&
          other.id == this.id &&
          other.title == this.title &&
          other.pinned == this.pinned &&
          other.archived == this.archived &&
          other.isCoaching == this.isCoaching &&
          other.lastMessageAt == this.lastMessageAt &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts);
}

class ConversationsCompanion extends UpdateCompanion<LocalConversation> {
  final Value<String> id;
  final Value<String> title;
  final Value<bool> pinned;
  final Value<bool> archived;
  final Value<bool> isCoaching;
  final Value<DateTime?> lastMessageAt;
  final Value<DateTime?> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<int> rowid;
  const ConversationsCompanion({
    this.id = const Value.absent(),
    this.title = const Value.absent(),
    this.pinned = const Value.absent(),
    this.archived = const Value.absent(),
    this.isCoaching = const Value.absent(),
    this.lastMessageAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ConversationsCompanion.insert({
    required String id,
    this.title = const Value.absent(),
    this.pinned = const Value.absent(),
    this.archived = const Value.absent(),
    this.isCoaching = const Value.absent(),
    this.lastMessageAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id);
  static Insertable<LocalConversation> custom({
    Expression<String>? id,
    Expression<String>? title,
    Expression<bool>? pinned,
    Expression<bool>? archived,
    Expression<bool>? isCoaching,
    Expression<DateTime>? lastMessageAt,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (title != null) 'title': title,
      if (pinned != null) 'pinned': pinned,
      if (archived != null) 'archived': archived,
      if (isCoaching != null) 'is_coaching': isCoaching,
      if (lastMessageAt != null) 'last_message_at': lastMessageAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (baseUpdatedAt != null) 'base_updated_at': baseUpdatedAt,
      if (pendingOp != null) 'pending_op': pendingOp,
      if (pushAttempts != null) 'push_attempts': pushAttempts,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ConversationsCompanion copyWith(
      {Value<String>? id,
      Value<String>? title,
      Value<bool>? pinned,
      Value<bool>? archived,
      Value<bool>? isCoaching,
      Value<DateTime?>? lastMessageAt,
      Value<DateTime?>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<int>? rowid}) {
    return ConversationsCompanion(
      id: id ?? this.id,
      title: title ?? this.title,
      pinned: pinned ?? this.pinned,
      archived: archived ?? this.archived,
      isCoaching: isCoaching ?? this.isCoaching,
      lastMessageAt: lastMessageAt ?? this.lastMessageAt,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (pinned.present) {
      map['pinned'] = Variable<bool>(pinned.value);
    }
    if (archived.present) {
      map['archived'] = Variable<bool>(archived.value);
    }
    if (isCoaching.present) {
      map['is_coaching'] = Variable<bool>(isCoaching.value);
    }
    if (lastMessageAt.present) {
      map['last_message_at'] = Variable<DateTime>(lastMessageAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (baseUpdatedAt.present) {
      map['base_updated_at'] = Variable<DateTime>(baseUpdatedAt.value);
    }
    if (pendingOp.present) {
      map['pending_op'] = Variable<String>(pendingOp.value);
    }
    if (pushAttempts.present) {
      map['push_attempts'] = Variable<int>(pushAttempts.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ConversationsCompanion(')
          ..write('id: $id, ')
          ..write('title: $title, ')
          ..write('pinned: $pinned, ')
          ..write('archived: $archived, ')
          ..write('isCoaching: $isCoaching, ')
          ..write('lastMessageAt: $lastMessageAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ChatMessagesTable extends ChatMessages
    with TableInfo<$ChatMessagesTable, LocalMessage> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ChatMessagesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _localIdMeta =
      const VerificationMeta('localId');
  @override
  late final GeneratedColumn<int> localId = GeneratedColumn<int>(
      'local_id', aliasedName, false,
      hasAutoIncrement: true,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('PRIMARY KEY AUTOINCREMENT'));
  static const VerificationMeta _serverIdMeta =
      const VerificationMeta('serverId');
  @override
  late final GeneratedColumn<int> serverId = GeneratedColumn<int>(
      'server_id', aliasedName, true,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'));
  static const VerificationMeta _clientIdMeta =
      const VerificationMeta('clientId');
  @override
  late final GeneratedColumn<String> clientId = GeneratedColumn<String>(
      'client_id', aliasedName, true,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'));
  static const VerificationMeta _conversationIdMeta =
      const VerificationMeta('conversationId');
  @override
  late final GeneratedColumn<String> conversationId = GeneratedColumn<String>(
      'conversation_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _roleMeta = const VerificationMeta('role');
  @override
  late final GeneratedColumn<String> role = GeneratedColumn<String>(
      'role', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _contentMeta =
      const VerificationMeta('content');
  @override
  late final GeneratedColumn<String> content = GeneratedColumn<String>(
      'content', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _composedAtMeta =
      const VerificationMeta('composedAt');
  @override
  late final GeneratedColumn<DateTime> composedAt = GeneratedColumn<DateTime>(
      'composed_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _syncStateMeta =
      const VerificationMeta('syncState');
  @override
  late final GeneratedColumn<String> syncState = GeneratedColumn<String>(
      'sync_state', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(SyncStates.synced));
  @override
  List<GeneratedColumn> get $columns => [
        localId,
        serverId,
        clientId,
        conversationId,
        role,
        content,
        composedAt,
        syncState
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'chat_messages';
  @override
  VerificationContext validateIntegrity(Insertable<LocalMessage> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('local_id')) {
      context.handle(_localIdMeta,
          localId.isAcceptableOrUnknown(data['local_id']!, _localIdMeta));
    }
    if (data.containsKey('server_id')) {
      context.handle(_serverIdMeta,
          serverId.isAcceptableOrUnknown(data['server_id']!, _serverIdMeta));
    }
    if (data.containsKey('client_id')) {
      context.handle(_clientIdMeta,
          clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta));
    }
    if (data.containsKey('conversation_id')) {
      context.handle(
          _conversationIdMeta,
          conversationId.isAcceptableOrUnknown(
              data['conversation_id']!, _conversationIdMeta));
    }
    if (data.containsKey('role')) {
      context.handle(
          _roleMeta, role.isAcceptableOrUnknown(data['role']!, _roleMeta));
    } else if (isInserting) {
      context.missing(_roleMeta);
    }
    if (data.containsKey('content')) {
      context.handle(_contentMeta,
          content.isAcceptableOrUnknown(data['content']!, _contentMeta));
    } else if (isInserting) {
      context.missing(_contentMeta);
    }
    if (data.containsKey('composed_at')) {
      context.handle(
          _composedAtMeta,
          composedAt.isAcceptableOrUnknown(
              data['composed_at']!, _composedAtMeta));
    } else if (isInserting) {
      context.missing(_composedAtMeta);
    }
    if (data.containsKey('sync_state')) {
      context.handle(_syncStateMeta,
          syncState.isAcceptableOrUnknown(data['sync_state']!, _syncStateMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {localId};
  @override
  LocalMessage map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalMessage(
      localId: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}local_id'])!,
      serverId: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}server_id']),
      clientId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}client_id']),
      conversationId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}conversation_id']),
      role: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}role'])!,
      content: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}content'])!,
      composedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}composed_at'])!,
      syncState: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}sync_state'])!,
    );
  }

  @override
  $ChatMessagesTable createAlias(String alias) {
    return $ChatMessagesTable(attachedDatabase, alias);
  }
}

class LocalMessage extends DataClass implements Insertable<LocalMessage> {
  final int localId;
  final int? serverId;
  final String? clientId;

  /// Null means "not known yet": a row cached before this app had chats, or one
  /// typed offline before its chat reached the gateway. A *synced* null is the
  /// signal that the whole cache predates chats — see [AppDatabase.hasLegacyMessages].
  final String? conversationId;
  final String role;
  final String content;
  final DateTime composedAt;
  final String syncState;
  const LocalMessage(
      {required this.localId,
      this.serverId,
      this.clientId,
      this.conversationId,
      required this.role,
      required this.content,
      required this.composedAt,
      required this.syncState});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['local_id'] = Variable<int>(localId);
    if (!nullToAbsent || serverId != null) {
      map['server_id'] = Variable<int>(serverId);
    }
    if (!nullToAbsent || clientId != null) {
      map['client_id'] = Variable<String>(clientId);
    }
    if (!nullToAbsent || conversationId != null) {
      map['conversation_id'] = Variable<String>(conversationId);
    }
    map['role'] = Variable<String>(role);
    map['content'] = Variable<String>(content);
    map['composed_at'] = Variable<DateTime>(composedAt);
    map['sync_state'] = Variable<String>(syncState);
    return map;
  }

  ChatMessagesCompanion toCompanion(bool nullToAbsent) {
    return ChatMessagesCompanion(
      localId: Value(localId),
      serverId: serverId == null && nullToAbsent
          ? const Value.absent()
          : Value(serverId),
      clientId: clientId == null && nullToAbsent
          ? const Value.absent()
          : Value(clientId),
      conversationId: conversationId == null && nullToAbsent
          ? const Value.absent()
          : Value(conversationId),
      role: Value(role),
      content: Value(content),
      composedAt: Value(composedAt),
      syncState: Value(syncState),
    );
  }

  factory LocalMessage.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalMessage(
      localId: serializer.fromJson<int>(json['localId']),
      serverId: serializer.fromJson<int?>(json['serverId']),
      clientId: serializer.fromJson<String?>(json['clientId']),
      conversationId: serializer.fromJson<String?>(json['conversationId']),
      role: serializer.fromJson<String>(json['role']),
      content: serializer.fromJson<String>(json['content']),
      composedAt: serializer.fromJson<DateTime>(json['composedAt']),
      syncState: serializer.fromJson<String>(json['syncState']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'localId': serializer.toJson<int>(localId),
      'serverId': serializer.toJson<int?>(serverId),
      'clientId': serializer.toJson<String?>(clientId),
      'conversationId': serializer.toJson<String?>(conversationId),
      'role': serializer.toJson<String>(role),
      'content': serializer.toJson<String>(content),
      'composedAt': serializer.toJson<DateTime>(composedAt),
      'syncState': serializer.toJson<String>(syncState),
    };
  }

  LocalMessage copyWith(
          {int? localId,
          Value<int?> serverId = const Value.absent(),
          Value<String?> clientId = const Value.absent(),
          Value<String?> conversationId = const Value.absent(),
          String? role,
          String? content,
          DateTime? composedAt,
          String? syncState}) =>
      LocalMessage(
        localId: localId ?? this.localId,
        serverId: serverId.present ? serverId.value : this.serverId,
        clientId: clientId.present ? clientId.value : this.clientId,
        conversationId:
            conversationId.present ? conversationId.value : this.conversationId,
        role: role ?? this.role,
        content: content ?? this.content,
        composedAt: composedAt ?? this.composedAt,
        syncState: syncState ?? this.syncState,
      );
  LocalMessage copyWithCompanion(ChatMessagesCompanion data) {
    return LocalMessage(
      localId: data.localId.present ? data.localId.value : this.localId,
      serverId: data.serverId.present ? data.serverId.value : this.serverId,
      clientId: data.clientId.present ? data.clientId.value : this.clientId,
      conversationId: data.conversationId.present
          ? data.conversationId.value
          : this.conversationId,
      role: data.role.present ? data.role.value : this.role,
      content: data.content.present ? data.content.value : this.content,
      composedAt:
          data.composedAt.present ? data.composedAt.value : this.composedAt,
      syncState: data.syncState.present ? data.syncState.value : this.syncState,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalMessage(')
          ..write('localId: $localId, ')
          ..write('serverId: $serverId, ')
          ..write('clientId: $clientId, ')
          ..write('conversationId: $conversationId, ')
          ..write('role: $role, ')
          ..write('content: $content, ')
          ..write('composedAt: $composedAt, ')
          ..write('syncState: $syncState')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(localId, serverId, clientId, conversationId,
      role, content, composedAt, syncState);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalMessage &&
          other.localId == this.localId &&
          other.serverId == this.serverId &&
          other.clientId == this.clientId &&
          other.conversationId == this.conversationId &&
          other.role == this.role &&
          other.content == this.content &&
          other.composedAt == this.composedAt &&
          other.syncState == this.syncState);
}

class ChatMessagesCompanion extends UpdateCompanion<LocalMessage> {
  final Value<int> localId;
  final Value<int?> serverId;
  final Value<String?> clientId;
  final Value<String?> conversationId;
  final Value<String> role;
  final Value<String> content;
  final Value<DateTime> composedAt;
  final Value<String> syncState;
  const ChatMessagesCompanion({
    this.localId = const Value.absent(),
    this.serverId = const Value.absent(),
    this.clientId = const Value.absent(),
    this.conversationId = const Value.absent(),
    this.role = const Value.absent(),
    this.content = const Value.absent(),
    this.composedAt = const Value.absent(),
    this.syncState = const Value.absent(),
  });
  ChatMessagesCompanion.insert({
    this.localId = const Value.absent(),
    this.serverId = const Value.absent(),
    this.clientId = const Value.absent(),
    this.conversationId = const Value.absent(),
    required String role,
    required String content,
    required DateTime composedAt,
    this.syncState = const Value.absent(),
  })  : role = Value(role),
        content = Value(content),
        composedAt = Value(composedAt);
  static Insertable<LocalMessage> custom({
    Expression<int>? localId,
    Expression<int>? serverId,
    Expression<String>? clientId,
    Expression<String>? conversationId,
    Expression<String>? role,
    Expression<String>? content,
    Expression<DateTime>? composedAt,
    Expression<String>? syncState,
  }) {
    return RawValuesInsertable({
      if (localId != null) 'local_id': localId,
      if (serverId != null) 'server_id': serverId,
      if (clientId != null) 'client_id': clientId,
      if (conversationId != null) 'conversation_id': conversationId,
      if (role != null) 'role': role,
      if (content != null) 'content': content,
      if (composedAt != null) 'composed_at': composedAt,
      if (syncState != null) 'sync_state': syncState,
    });
  }

  ChatMessagesCompanion copyWith(
      {Value<int>? localId,
      Value<int?>? serverId,
      Value<String?>? clientId,
      Value<String?>? conversationId,
      Value<String>? role,
      Value<String>? content,
      Value<DateTime>? composedAt,
      Value<String>? syncState}) {
    return ChatMessagesCompanion(
      localId: localId ?? this.localId,
      serverId: serverId ?? this.serverId,
      clientId: clientId ?? this.clientId,
      conversationId: conversationId ?? this.conversationId,
      role: role ?? this.role,
      content: content ?? this.content,
      composedAt: composedAt ?? this.composedAt,
      syncState: syncState ?? this.syncState,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (localId.present) {
      map['local_id'] = Variable<int>(localId.value);
    }
    if (serverId.present) {
      map['server_id'] = Variable<int>(serverId.value);
    }
    if (clientId.present) {
      map['client_id'] = Variable<String>(clientId.value);
    }
    if (conversationId.present) {
      map['conversation_id'] = Variable<String>(conversationId.value);
    }
    if (role.present) {
      map['role'] = Variable<String>(role.value);
    }
    if (content.present) {
      map['content'] = Variable<String>(content.value);
    }
    if (composedAt.present) {
      map['composed_at'] = Variable<DateTime>(composedAt.value);
    }
    if (syncState.present) {
      map['sync_state'] = Variable<String>(syncState.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ChatMessagesCompanion(')
          ..write('localId: $localId, ')
          ..write('serverId: $serverId, ')
          ..write('clientId: $clientId, ')
          ..write('conversationId: $conversationId, ')
          ..write('role: $role, ')
          ..write('content: $content, ')
          ..write('composedAt: $composedAt, ')
          ..write('syncState: $syncState')
          ..write(')'))
        .toString();
  }
}

class $KeyValuesTable extends KeyValues
    with TableInfo<$KeyValuesTable, KeyValue> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $KeyValuesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _kMeta = const VerificationMeta('k');
  @override
  late final GeneratedColumn<String> k = GeneratedColumn<String>(
      'k', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vMeta = const VerificationMeta('v');
  @override
  late final GeneratedColumn<String> v = GeneratedColumn<String>(
      'v', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [k, v];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'key_values';
  @override
  VerificationContext validateIntegrity(Insertable<KeyValue> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('k')) {
      context.handle(_kMeta, k.isAcceptableOrUnknown(data['k']!, _kMeta));
    } else if (isInserting) {
      context.missing(_kMeta);
    }
    if (data.containsKey('v')) {
      context.handle(_vMeta, v.isAcceptableOrUnknown(data['v']!, _vMeta));
    } else if (isInserting) {
      context.missing(_vMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {k};
  @override
  KeyValue map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return KeyValue(
      k: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}k'])!,
      v: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}v'])!,
    );
  }

  @override
  $KeyValuesTable createAlias(String alias) {
    return $KeyValuesTable(attachedDatabase, alias);
  }
}

class KeyValue extends DataClass implements Insertable<KeyValue> {
  final String k;
  final String v;
  const KeyValue({required this.k, required this.v});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['k'] = Variable<String>(k);
    map['v'] = Variable<String>(v);
    return map;
  }

  KeyValuesCompanion toCompanion(bool nullToAbsent) {
    return KeyValuesCompanion(
      k: Value(k),
      v: Value(v),
    );
  }

  factory KeyValue.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return KeyValue(
      k: serializer.fromJson<String>(json['k']),
      v: serializer.fromJson<String>(json['v']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'k': serializer.toJson<String>(k),
      'v': serializer.toJson<String>(v),
    };
  }

  KeyValue copyWith({String? k, String? v}) => KeyValue(
        k: k ?? this.k,
        v: v ?? this.v,
      );
  KeyValue copyWithCompanion(KeyValuesCompanion data) {
    return KeyValue(
      k: data.k.present ? data.k.value : this.k,
      v: data.v.present ? data.v.value : this.v,
    );
  }

  @override
  String toString() {
    return (StringBuffer('KeyValue(')
          ..write('k: $k, ')
          ..write('v: $v')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(k, v);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is KeyValue && other.k == this.k && other.v == this.v);
}

class KeyValuesCompanion extends UpdateCompanion<KeyValue> {
  final Value<String> k;
  final Value<String> v;
  final Value<int> rowid;
  const KeyValuesCompanion({
    this.k = const Value.absent(),
    this.v = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  KeyValuesCompanion.insert({
    required String k,
    required String v,
    this.rowid = const Value.absent(),
  })  : k = Value(k),
        v = Value(v);
  static Insertable<KeyValue> custom({
    Expression<String>? k,
    Expression<String>? v,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (k != null) 'k': k,
      if (v != null) 'v': v,
      if (rowid != null) 'rowid': rowid,
    });
  }

  KeyValuesCompanion copyWith(
      {Value<String>? k, Value<String>? v, Value<int>? rowid}) {
    return KeyValuesCompanion(
      k: k ?? this.k,
      v: v ?? this.v,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (k.present) {
      map['k'] = Variable<String>(k.value);
    }
    if (v.present) {
      map['v'] = Variable<String>(v.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('KeyValuesCompanion(')
          ..write('k: $k, ')
          ..write('v: $v, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CoachingProfilesTable extends CoachingProfiles
    with TableInfo<$CoachingProfilesTable, LocalProfile> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CoachingProfilesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
      'id', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _optedInMeta =
      const VerificationMeta('optedIn');
  @override
  late final GeneratedColumn<bool> optedIn = GeneratedColumn<bool>(
      'opted_in', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("opted_in" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _timezoneMeta =
      const VerificationMeta('timezone');
  @override
  late final GeneratedColumn<String> timezone = GeneratedColumn<String>(
      'timezone', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('UTC'));
  static const VerificationMeta _trainingDaysMeta =
      const VerificationMeta('trainingDays');
  @override
  late final GeneratedColumn<String> trainingDays = GeneratedColumn<String>(
      'training_days', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _allergiesMeta =
      const VerificationMeta('allergies');
  @override
  late final GeneratedColumn<String> allergies = GeneratedColumn<String>(
      'allergies', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _gymTimeMeta =
      const VerificationMeta('gymTime');
  @override
  late final GeneratedColumn<String> gymTime = GeneratedColumn<String>(
      'gym_time', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _checkinTimeMeta =
      const VerificationMeta('checkinTime');
  @override
  late final GeneratedColumn<String> checkinTime = GeneratedColumn<String>(
      'checkin_time', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _programTimeMeta =
      const VerificationMeta('programTime');
  @override
  late final GeneratedColumn<String> programTime = GeneratedColumn<String>(
      'program_time', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _languageMeta =
      const VerificationMeta('language');
  @override
  late final GeneratedColumn<String> language = GeneratedColumn<String>(
      'language', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _awaitingCheckinMeta =
      const VerificationMeta('awaitingCheckin');
  @override
  late final GeneratedColumn<bool> awaitingCheckin = GeneratedColumn<bool>(
      'awaiting_checkin', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints: GeneratedColumn.constraintIsAlways(
          'CHECK ("awaiting_checkin" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _awaitingSinceMeta =
      const VerificationMeta('awaitingSince');
  @override
  late final GeneratedColumn<DateTime> awaitingSince =
      GeneratedColumn<DateTime>('awaiting_since', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _dirtyMeta = const VerificationMeta('dirty');
  @override
  late final GeneratedColumn<bool> dirty = GeneratedColumn<bool>(
      'dirty', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("dirty" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        optedIn,
        timezone,
        trainingDays,
        allergies,
        gymTime,
        checkinTime,
        programTime,
        language,
        awaitingCheckin,
        awaitingSince,
        dirty,
        updatedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'coaching_profiles';
  @override
  VerificationContext validateIntegrity(Insertable<LocalProfile> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('opted_in')) {
      context.handle(_optedInMeta,
          optedIn.isAcceptableOrUnknown(data['opted_in']!, _optedInMeta));
    }
    if (data.containsKey('timezone')) {
      context.handle(_timezoneMeta,
          timezone.isAcceptableOrUnknown(data['timezone']!, _timezoneMeta));
    }
    if (data.containsKey('training_days')) {
      context.handle(
          _trainingDaysMeta,
          trainingDays.isAcceptableOrUnknown(
              data['training_days']!, _trainingDaysMeta));
    }
    if (data.containsKey('allergies')) {
      context.handle(_allergiesMeta,
          allergies.isAcceptableOrUnknown(data['allergies']!, _allergiesMeta));
    }
    if (data.containsKey('gym_time')) {
      context.handle(_gymTimeMeta,
          gymTime.isAcceptableOrUnknown(data['gym_time']!, _gymTimeMeta));
    }
    if (data.containsKey('checkin_time')) {
      context.handle(
          _checkinTimeMeta,
          checkinTime.isAcceptableOrUnknown(
              data['checkin_time']!, _checkinTimeMeta));
    }
    if (data.containsKey('program_time')) {
      context.handle(
          _programTimeMeta,
          programTime.isAcceptableOrUnknown(
              data['program_time']!, _programTimeMeta));
    }
    if (data.containsKey('language')) {
      context.handle(_languageMeta,
          language.isAcceptableOrUnknown(data['language']!, _languageMeta));
    }
    if (data.containsKey('awaiting_checkin')) {
      context.handle(
          _awaitingCheckinMeta,
          awaitingCheckin.isAcceptableOrUnknown(
              data['awaiting_checkin']!, _awaitingCheckinMeta));
    }
    if (data.containsKey('awaiting_since')) {
      context.handle(
          _awaitingSinceMeta,
          awaitingSince.isAcceptableOrUnknown(
              data['awaiting_since']!, _awaitingSinceMeta));
    }
    if (data.containsKey('dirty')) {
      context.handle(
          _dirtyMeta, dirty.isAcceptableOrUnknown(data['dirty']!, _dirtyMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalProfile map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalProfile(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}id'])!,
      optedIn: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}opted_in'])!,
      timezone: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}timezone'])!,
      trainingDays: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}training_days'])!,
      allergies: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}allergies'])!,
      gymTime: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}gym_time']),
      checkinTime: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}checkin_time']),
      programTime: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}program_time']),
      language: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}language']),
      awaitingCheckin: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}awaiting_checkin'])!,
      awaitingSince: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}awaiting_since']),
      dirty: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}dirty'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']),
    );
  }

  @override
  $CoachingProfilesTable createAlias(String alias) {
    return $CoachingProfilesTable(attachedDatabase, alias);
  }
}

class LocalProfile extends DataClass implements Insertable<LocalProfile> {
  final int id;
  final bool optedIn;
  final String timezone;

  /// JSON arrays, matching how [Reminders.leadTimes] already stores a list.
  final String trainingDays;
  final String allergies;
  final String? gymTime;
  final String? checkinTime;
  final String? programTime;
  final String? language;
  final bool awaitingCheckin;
  final DateTime? awaitingSince;

  /// True while this device holds an edit the server has not accepted yet.
  final bool dirty;
  final DateTime? updatedAt;
  const LocalProfile(
      {required this.id,
      required this.optedIn,
      required this.timezone,
      required this.trainingDays,
      required this.allergies,
      this.gymTime,
      this.checkinTime,
      this.programTime,
      this.language,
      required this.awaitingCheckin,
      this.awaitingSince,
      required this.dirty,
      this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['opted_in'] = Variable<bool>(optedIn);
    map['timezone'] = Variable<String>(timezone);
    map['training_days'] = Variable<String>(trainingDays);
    map['allergies'] = Variable<String>(allergies);
    if (!nullToAbsent || gymTime != null) {
      map['gym_time'] = Variable<String>(gymTime);
    }
    if (!nullToAbsent || checkinTime != null) {
      map['checkin_time'] = Variable<String>(checkinTime);
    }
    if (!nullToAbsent || programTime != null) {
      map['program_time'] = Variable<String>(programTime);
    }
    if (!nullToAbsent || language != null) {
      map['language'] = Variable<String>(language);
    }
    map['awaiting_checkin'] = Variable<bool>(awaitingCheckin);
    if (!nullToAbsent || awaitingSince != null) {
      map['awaiting_since'] = Variable<DateTime>(awaitingSince);
    }
    map['dirty'] = Variable<bool>(dirty);
    if (!nullToAbsent || updatedAt != null) {
      map['updated_at'] = Variable<DateTime>(updatedAt);
    }
    return map;
  }

  CoachingProfilesCompanion toCompanion(bool nullToAbsent) {
    return CoachingProfilesCompanion(
      id: Value(id),
      optedIn: Value(optedIn),
      timezone: Value(timezone),
      trainingDays: Value(trainingDays),
      allergies: Value(allergies),
      gymTime: gymTime == null && nullToAbsent
          ? const Value.absent()
          : Value(gymTime),
      checkinTime: checkinTime == null && nullToAbsent
          ? const Value.absent()
          : Value(checkinTime),
      programTime: programTime == null && nullToAbsent
          ? const Value.absent()
          : Value(programTime),
      language: language == null && nullToAbsent
          ? const Value.absent()
          : Value(language),
      awaitingCheckin: Value(awaitingCheckin),
      awaitingSince: awaitingSince == null && nullToAbsent
          ? const Value.absent()
          : Value(awaitingSince),
      dirty: Value(dirty),
      updatedAt: updatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(updatedAt),
    );
  }

  factory LocalProfile.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalProfile(
      id: serializer.fromJson<int>(json['id']),
      optedIn: serializer.fromJson<bool>(json['optedIn']),
      timezone: serializer.fromJson<String>(json['timezone']),
      trainingDays: serializer.fromJson<String>(json['trainingDays']),
      allergies: serializer.fromJson<String>(json['allergies']),
      gymTime: serializer.fromJson<String?>(json['gymTime']),
      checkinTime: serializer.fromJson<String?>(json['checkinTime']),
      programTime: serializer.fromJson<String?>(json['programTime']),
      language: serializer.fromJson<String?>(json['language']),
      awaitingCheckin: serializer.fromJson<bool>(json['awaitingCheckin']),
      awaitingSince: serializer.fromJson<DateTime?>(json['awaitingSince']),
      dirty: serializer.fromJson<bool>(json['dirty']),
      updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'optedIn': serializer.toJson<bool>(optedIn),
      'timezone': serializer.toJson<String>(timezone),
      'trainingDays': serializer.toJson<String>(trainingDays),
      'allergies': serializer.toJson<String>(allergies),
      'gymTime': serializer.toJson<String?>(gymTime),
      'checkinTime': serializer.toJson<String?>(checkinTime),
      'programTime': serializer.toJson<String?>(programTime),
      'language': serializer.toJson<String?>(language),
      'awaitingCheckin': serializer.toJson<bool>(awaitingCheckin),
      'awaitingSince': serializer.toJson<DateTime?>(awaitingSince),
      'dirty': serializer.toJson<bool>(dirty),
      'updatedAt': serializer.toJson<DateTime?>(updatedAt),
    };
  }

  LocalProfile copyWith(
          {int? id,
          bool? optedIn,
          String? timezone,
          String? trainingDays,
          String? allergies,
          Value<String?> gymTime = const Value.absent(),
          Value<String?> checkinTime = const Value.absent(),
          Value<String?> programTime = const Value.absent(),
          Value<String?> language = const Value.absent(),
          bool? awaitingCheckin,
          Value<DateTime?> awaitingSince = const Value.absent(),
          bool? dirty,
          Value<DateTime?> updatedAt = const Value.absent()}) =>
      LocalProfile(
        id: id ?? this.id,
        optedIn: optedIn ?? this.optedIn,
        timezone: timezone ?? this.timezone,
        trainingDays: trainingDays ?? this.trainingDays,
        allergies: allergies ?? this.allergies,
        gymTime: gymTime.present ? gymTime.value : this.gymTime,
        checkinTime: checkinTime.present ? checkinTime.value : this.checkinTime,
        programTime: programTime.present ? programTime.value : this.programTime,
        language: language.present ? language.value : this.language,
        awaitingCheckin: awaitingCheckin ?? this.awaitingCheckin,
        awaitingSince:
            awaitingSince.present ? awaitingSince.value : this.awaitingSince,
        dirty: dirty ?? this.dirty,
        updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,
      );
  LocalProfile copyWithCompanion(CoachingProfilesCompanion data) {
    return LocalProfile(
      id: data.id.present ? data.id.value : this.id,
      optedIn: data.optedIn.present ? data.optedIn.value : this.optedIn,
      timezone: data.timezone.present ? data.timezone.value : this.timezone,
      trainingDays: data.trainingDays.present
          ? data.trainingDays.value
          : this.trainingDays,
      allergies: data.allergies.present ? data.allergies.value : this.allergies,
      gymTime: data.gymTime.present ? data.gymTime.value : this.gymTime,
      checkinTime:
          data.checkinTime.present ? data.checkinTime.value : this.checkinTime,
      programTime:
          data.programTime.present ? data.programTime.value : this.programTime,
      language: data.language.present ? data.language.value : this.language,
      awaitingCheckin: data.awaitingCheckin.present
          ? data.awaitingCheckin.value
          : this.awaitingCheckin,
      awaitingSince: data.awaitingSince.present
          ? data.awaitingSince.value
          : this.awaitingSince,
      dirty: data.dirty.present ? data.dirty.value : this.dirty,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalProfile(')
          ..write('id: $id, ')
          ..write('optedIn: $optedIn, ')
          ..write('timezone: $timezone, ')
          ..write('trainingDays: $trainingDays, ')
          ..write('allergies: $allergies, ')
          ..write('gymTime: $gymTime, ')
          ..write('checkinTime: $checkinTime, ')
          ..write('programTime: $programTime, ')
          ..write('language: $language, ')
          ..write('awaitingCheckin: $awaitingCheckin, ')
          ..write('awaitingSince: $awaitingSince, ')
          ..write('dirty: $dirty, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      id,
      optedIn,
      timezone,
      trainingDays,
      allergies,
      gymTime,
      checkinTime,
      programTime,
      language,
      awaitingCheckin,
      awaitingSince,
      dirty,
      updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalProfile &&
          other.id == this.id &&
          other.optedIn == this.optedIn &&
          other.timezone == this.timezone &&
          other.trainingDays == this.trainingDays &&
          other.allergies == this.allergies &&
          other.gymTime == this.gymTime &&
          other.checkinTime == this.checkinTime &&
          other.programTime == this.programTime &&
          other.language == this.language &&
          other.awaitingCheckin == this.awaitingCheckin &&
          other.awaitingSince == this.awaitingSince &&
          other.dirty == this.dirty &&
          other.updatedAt == this.updatedAt);
}

class CoachingProfilesCompanion extends UpdateCompanion<LocalProfile> {
  final Value<int> id;
  final Value<bool> optedIn;
  final Value<String> timezone;
  final Value<String> trainingDays;
  final Value<String> allergies;
  final Value<String?> gymTime;
  final Value<String?> checkinTime;
  final Value<String?> programTime;
  final Value<String?> language;
  final Value<bool> awaitingCheckin;
  final Value<DateTime?> awaitingSince;
  final Value<bool> dirty;
  final Value<DateTime?> updatedAt;
  const CoachingProfilesCompanion({
    this.id = const Value.absent(),
    this.optedIn = const Value.absent(),
    this.timezone = const Value.absent(),
    this.trainingDays = const Value.absent(),
    this.allergies = const Value.absent(),
    this.gymTime = const Value.absent(),
    this.checkinTime = const Value.absent(),
    this.programTime = const Value.absent(),
    this.language = const Value.absent(),
    this.awaitingCheckin = const Value.absent(),
    this.awaitingSince = const Value.absent(),
    this.dirty = const Value.absent(),
    this.updatedAt = const Value.absent(),
  });
  CoachingProfilesCompanion.insert({
    this.id = const Value.absent(),
    this.optedIn = const Value.absent(),
    this.timezone = const Value.absent(),
    this.trainingDays = const Value.absent(),
    this.allergies = const Value.absent(),
    this.gymTime = const Value.absent(),
    this.checkinTime = const Value.absent(),
    this.programTime = const Value.absent(),
    this.language = const Value.absent(),
    this.awaitingCheckin = const Value.absent(),
    this.awaitingSince = const Value.absent(),
    this.dirty = const Value.absent(),
    this.updatedAt = const Value.absent(),
  });
  static Insertable<LocalProfile> custom({
    Expression<int>? id,
    Expression<bool>? optedIn,
    Expression<String>? timezone,
    Expression<String>? trainingDays,
    Expression<String>? allergies,
    Expression<String>? gymTime,
    Expression<String>? checkinTime,
    Expression<String>? programTime,
    Expression<String>? language,
    Expression<bool>? awaitingCheckin,
    Expression<DateTime>? awaitingSince,
    Expression<bool>? dirty,
    Expression<DateTime>? updatedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (optedIn != null) 'opted_in': optedIn,
      if (timezone != null) 'timezone': timezone,
      if (trainingDays != null) 'training_days': trainingDays,
      if (allergies != null) 'allergies': allergies,
      if (gymTime != null) 'gym_time': gymTime,
      if (checkinTime != null) 'checkin_time': checkinTime,
      if (programTime != null) 'program_time': programTime,
      if (language != null) 'language': language,
      if (awaitingCheckin != null) 'awaiting_checkin': awaitingCheckin,
      if (awaitingSince != null) 'awaiting_since': awaitingSince,
      if (dirty != null) 'dirty': dirty,
      if (updatedAt != null) 'updated_at': updatedAt,
    });
  }

  CoachingProfilesCompanion copyWith(
      {Value<int>? id,
      Value<bool>? optedIn,
      Value<String>? timezone,
      Value<String>? trainingDays,
      Value<String>? allergies,
      Value<String?>? gymTime,
      Value<String?>? checkinTime,
      Value<String?>? programTime,
      Value<String?>? language,
      Value<bool>? awaitingCheckin,
      Value<DateTime?>? awaitingSince,
      Value<bool>? dirty,
      Value<DateTime?>? updatedAt}) {
    return CoachingProfilesCompanion(
      id: id ?? this.id,
      optedIn: optedIn ?? this.optedIn,
      timezone: timezone ?? this.timezone,
      trainingDays: trainingDays ?? this.trainingDays,
      allergies: allergies ?? this.allergies,
      gymTime: gymTime ?? this.gymTime,
      checkinTime: checkinTime ?? this.checkinTime,
      programTime: programTime ?? this.programTime,
      language: language ?? this.language,
      awaitingCheckin: awaitingCheckin ?? this.awaitingCheckin,
      awaitingSince: awaitingSince ?? this.awaitingSince,
      dirty: dirty ?? this.dirty,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (optedIn.present) {
      map['opted_in'] = Variable<bool>(optedIn.value);
    }
    if (timezone.present) {
      map['timezone'] = Variable<String>(timezone.value);
    }
    if (trainingDays.present) {
      map['training_days'] = Variable<String>(trainingDays.value);
    }
    if (allergies.present) {
      map['allergies'] = Variable<String>(allergies.value);
    }
    if (gymTime.present) {
      map['gym_time'] = Variable<String>(gymTime.value);
    }
    if (checkinTime.present) {
      map['checkin_time'] = Variable<String>(checkinTime.value);
    }
    if (programTime.present) {
      map['program_time'] = Variable<String>(programTime.value);
    }
    if (language.present) {
      map['language'] = Variable<String>(language.value);
    }
    if (awaitingCheckin.present) {
      map['awaiting_checkin'] = Variable<bool>(awaitingCheckin.value);
    }
    if (awaitingSince.present) {
      map['awaiting_since'] = Variable<DateTime>(awaitingSince.value);
    }
    if (dirty.present) {
      map['dirty'] = Variable<bool>(dirty.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CoachingProfilesCompanion(')
          ..write('id: $id, ')
          ..write('optedIn: $optedIn, ')
          ..write('timezone: $timezone, ')
          ..write('trainingDays: $trainingDays, ')
          ..write('allergies: $allergies, ')
          ..write('gymTime: $gymTime, ')
          ..write('checkinTime: $checkinTime, ')
          ..write('programTime: $programTime, ')
          ..write('language: $language, ')
          ..write('awaitingCheckin: $awaitingCheckin, ')
          ..write('awaitingSince: $awaitingSince, ')
          ..write('dirty: $dirty, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }
}

class $CheckinsTable extends Checkins
    with TableInfo<$CheckinsTable, LocalCheckin> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CheckinsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _checkinDateMeta =
      const VerificationMeta('checkinDate');
  @override
  late final GeneratedColumn<String> checkinDate = GeneratedColumn<String>(
      'checkin_date', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _adheredMeta =
      const VerificationMeta('adhered');
  @override
  late final GeneratedColumn<bool> adhered = GeneratedColumn<bool>(
      'adhered', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("adhered" IN (0, 1))'));
  static const VerificationMeta _rawReplyMeta =
      const VerificationMeta('rawReply');
  @override
  late final GeneratedColumn<String> rawReply = GeneratedColumn<String>(
      'raw_reply', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [checkinDate, adhered, rawReply, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'checkins';
  @override
  VerificationContext validateIntegrity(Insertable<LocalCheckin> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('checkin_date')) {
      context.handle(
          _checkinDateMeta,
          checkinDate.isAcceptableOrUnknown(
              data['checkin_date']!, _checkinDateMeta));
    } else if (isInserting) {
      context.missing(_checkinDateMeta);
    }
    if (data.containsKey('adhered')) {
      context.handle(_adheredMeta,
          adhered.isAcceptableOrUnknown(data['adhered']!, _adheredMeta));
    } else if (isInserting) {
      context.missing(_adheredMeta);
    }
    if (data.containsKey('raw_reply')) {
      context.handle(_rawReplyMeta,
          rawReply.isAcceptableOrUnknown(data['raw_reply']!, _rawReplyMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {checkinDate};
  @override
  LocalCheckin map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalCheckin(
      checkinDate: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}checkin_date'])!,
      adhered: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}adhered'])!,
      rawReply: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}raw_reply']),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $CheckinsTable createAlias(String alias) {
    return $CheckinsTable(attachedDatabase, alias);
  }
}

class LocalCheckin extends DataClass implements Insertable<LocalCheckin> {
  /// The server's own unique key, so an upsert is idempotent without an id.
  final String checkinDate;
  final bool adhered;
  final String? rawReply;
  final DateTime createdAt;
  const LocalCheckin(
      {required this.checkinDate,
      required this.adhered,
      this.rawReply,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['checkin_date'] = Variable<String>(checkinDate);
    map['adhered'] = Variable<bool>(adhered);
    if (!nullToAbsent || rawReply != null) {
      map['raw_reply'] = Variable<String>(rawReply);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  CheckinsCompanion toCompanion(bool nullToAbsent) {
    return CheckinsCompanion(
      checkinDate: Value(checkinDate),
      adhered: Value(adhered),
      rawReply: rawReply == null && nullToAbsent
          ? const Value.absent()
          : Value(rawReply),
      createdAt: Value(createdAt),
    );
  }

  factory LocalCheckin.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalCheckin(
      checkinDate: serializer.fromJson<String>(json['checkinDate']),
      adhered: serializer.fromJson<bool>(json['adhered']),
      rawReply: serializer.fromJson<String?>(json['rawReply']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'checkinDate': serializer.toJson<String>(checkinDate),
      'adhered': serializer.toJson<bool>(adhered),
      'rawReply': serializer.toJson<String?>(rawReply),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalCheckin copyWith(
          {String? checkinDate,
          bool? adhered,
          Value<String?> rawReply = const Value.absent(),
          DateTime? createdAt}) =>
      LocalCheckin(
        checkinDate: checkinDate ?? this.checkinDate,
        adhered: adhered ?? this.adhered,
        rawReply: rawReply.present ? rawReply.value : this.rawReply,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalCheckin copyWithCompanion(CheckinsCompanion data) {
    return LocalCheckin(
      checkinDate:
          data.checkinDate.present ? data.checkinDate.value : this.checkinDate,
      adhered: data.adhered.present ? data.adhered.value : this.adhered,
      rawReply: data.rawReply.present ? data.rawReply.value : this.rawReply,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalCheckin(')
          ..write('checkinDate: $checkinDate, ')
          ..write('adhered: $adhered, ')
          ..write('rawReply: $rawReply, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(checkinDate, adhered, rawReply, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalCheckin &&
          other.checkinDate == this.checkinDate &&
          other.adhered == this.adhered &&
          other.rawReply == this.rawReply &&
          other.createdAt == this.createdAt);
}

class CheckinsCompanion extends UpdateCompanion<LocalCheckin> {
  final Value<String> checkinDate;
  final Value<bool> adhered;
  final Value<String?> rawReply;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const CheckinsCompanion({
    this.checkinDate = const Value.absent(),
    this.adhered = const Value.absent(),
    this.rawReply = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CheckinsCompanion.insert({
    required String checkinDate,
    required bool adhered,
    this.rawReply = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : checkinDate = Value(checkinDate),
        adhered = Value(adhered),
        createdAt = Value(createdAt);
  static Insertable<LocalCheckin> custom({
    Expression<String>? checkinDate,
    Expression<bool>? adhered,
    Expression<String>? rawReply,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (checkinDate != null) 'checkin_date': checkinDate,
      if (adhered != null) 'adhered': adhered,
      if (rawReply != null) 'raw_reply': rawReply,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CheckinsCompanion copyWith(
      {Value<String>? checkinDate,
      Value<bool>? adhered,
      Value<String?>? rawReply,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return CheckinsCompanion(
      checkinDate: checkinDate ?? this.checkinDate,
      adhered: adhered ?? this.adhered,
      rawReply: rawReply ?? this.rawReply,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (checkinDate.present) {
      map['checkin_date'] = Variable<String>(checkinDate.value);
    }
    if (adhered.present) {
      map['adhered'] = Variable<bool>(adhered.value);
    }
    if (rawReply.present) {
      map['raw_reply'] = Variable<String>(rawReply.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CheckinsCompanion(')
          ..write('checkinDate: $checkinDate, ')
          ..write('adhered: $adhered, ')
          ..write('rawReply: $rawReply, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $WorkoutRecordsTable extends WorkoutRecords
    with TableInfo<$WorkoutRecordsTable, LocalWorkout> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $WorkoutRecordsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _workoutDateMeta =
      const VerificationMeta('workoutDate');
  @override
  late final GeneratedColumn<String> workoutDate = GeneratedColumn<String>(
      'workout_date', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  @override
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
      'source', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _exercisesMeta =
      const VerificationMeta('exercises');
  @override
  late final GeneratedColumn<String> exercises = GeneratedColumn<String>(
      'exercises', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _muscleGroupsMeta =
      const VerificationMeta('muscleGroups');
  @override
  late final GeneratedColumn<String> muscleGroups = GeneratedColumn<String>(
      'muscle_groups', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
      'notes', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [workoutDate, source, exercises, muscleGroups, notes, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'workout_records';
  @override
  VerificationContext validateIntegrity(Insertable<LocalWorkout> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('workout_date')) {
      context.handle(
          _workoutDateMeta,
          workoutDate.isAcceptableOrUnknown(
              data['workout_date']!, _workoutDateMeta));
    } else if (isInserting) {
      context.missing(_workoutDateMeta);
    }
    if (data.containsKey('source')) {
      context.handle(_sourceMeta,
          source.isAcceptableOrUnknown(data['source']!, _sourceMeta));
    } else if (isInserting) {
      context.missing(_sourceMeta);
    }
    if (data.containsKey('exercises')) {
      context.handle(_exercisesMeta,
          exercises.isAcceptableOrUnknown(data['exercises']!, _exercisesMeta));
    }
    if (data.containsKey('muscle_groups')) {
      context.handle(
          _muscleGroupsMeta,
          muscleGroups.isAcceptableOrUnknown(
              data['muscle_groups']!, _muscleGroupsMeta));
    }
    if (data.containsKey('notes')) {
      context.handle(
          _notesMeta, notes.isAcceptableOrUnknown(data['notes']!, _notesMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {workoutDate};
  @override
  LocalWorkout map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalWorkout(
      workoutDate: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}workout_date'])!,
      source: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}source'])!,
      exercises: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}exercises'])!,
      muscleGroups: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}muscle_groups'])!,
      notes: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}notes']),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $WorkoutRecordsTable createAlias(String alias) {
    return $WorkoutRecordsTable(attachedDatabase, alias);
  }
}

class LocalWorkout extends DataClass implements Insertable<LocalWorkout> {
  final String workoutDate;
  final String source;
  final String exercises;
  final String muscleGroups;
  final String? notes;
  final DateTime createdAt;
  const LocalWorkout(
      {required this.workoutDate,
      required this.source,
      required this.exercises,
      required this.muscleGroups,
      this.notes,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['workout_date'] = Variable<String>(workoutDate);
    map['source'] = Variable<String>(source);
    map['exercises'] = Variable<String>(exercises);
    map['muscle_groups'] = Variable<String>(muscleGroups);
    if (!nullToAbsent || notes != null) {
      map['notes'] = Variable<String>(notes);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  WorkoutRecordsCompanion toCompanion(bool nullToAbsent) {
    return WorkoutRecordsCompanion(
      workoutDate: Value(workoutDate),
      source: Value(source),
      exercises: Value(exercises),
      muscleGroups: Value(muscleGroups),
      notes:
          notes == null && nullToAbsent ? const Value.absent() : Value(notes),
      createdAt: Value(createdAt),
    );
  }

  factory LocalWorkout.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalWorkout(
      workoutDate: serializer.fromJson<String>(json['workoutDate']),
      source: serializer.fromJson<String>(json['source']),
      exercises: serializer.fromJson<String>(json['exercises']),
      muscleGroups: serializer.fromJson<String>(json['muscleGroups']),
      notes: serializer.fromJson<String?>(json['notes']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'workoutDate': serializer.toJson<String>(workoutDate),
      'source': serializer.toJson<String>(source),
      'exercises': serializer.toJson<String>(exercises),
      'muscleGroups': serializer.toJson<String>(muscleGroups),
      'notes': serializer.toJson<String?>(notes),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalWorkout copyWith(
          {String? workoutDate,
          String? source,
          String? exercises,
          String? muscleGroups,
          Value<String?> notes = const Value.absent(),
          DateTime? createdAt}) =>
      LocalWorkout(
        workoutDate: workoutDate ?? this.workoutDate,
        source: source ?? this.source,
        exercises: exercises ?? this.exercises,
        muscleGroups: muscleGroups ?? this.muscleGroups,
        notes: notes.present ? notes.value : this.notes,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalWorkout copyWithCompanion(WorkoutRecordsCompanion data) {
    return LocalWorkout(
      workoutDate:
          data.workoutDate.present ? data.workoutDate.value : this.workoutDate,
      source: data.source.present ? data.source.value : this.source,
      exercises: data.exercises.present ? data.exercises.value : this.exercises,
      muscleGroups: data.muscleGroups.present
          ? data.muscleGroups.value
          : this.muscleGroups,
      notes: data.notes.present ? data.notes.value : this.notes,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalWorkout(')
          ..write('workoutDate: $workoutDate, ')
          ..write('source: $source, ')
          ..write('exercises: $exercises, ')
          ..write('muscleGroups: $muscleGroups, ')
          ..write('notes: $notes, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      workoutDate, source, exercises, muscleGroups, notes, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalWorkout &&
          other.workoutDate == this.workoutDate &&
          other.source == this.source &&
          other.exercises == this.exercises &&
          other.muscleGroups == this.muscleGroups &&
          other.notes == this.notes &&
          other.createdAt == this.createdAt);
}

class WorkoutRecordsCompanion extends UpdateCompanion<LocalWorkout> {
  final Value<String> workoutDate;
  final Value<String> source;
  final Value<String> exercises;
  final Value<String> muscleGroups;
  final Value<String?> notes;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const WorkoutRecordsCompanion({
    this.workoutDate = const Value.absent(),
    this.source = const Value.absent(),
    this.exercises = const Value.absent(),
    this.muscleGroups = const Value.absent(),
    this.notes = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  WorkoutRecordsCompanion.insert({
    required String workoutDate,
    required String source,
    this.exercises = const Value.absent(),
    this.muscleGroups = const Value.absent(),
    this.notes = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : workoutDate = Value(workoutDate),
        source = Value(source),
        createdAt = Value(createdAt);
  static Insertable<LocalWorkout> custom({
    Expression<String>? workoutDate,
    Expression<String>? source,
    Expression<String>? exercises,
    Expression<String>? muscleGroups,
    Expression<String>? notes,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (workoutDate != null) 'workout_date': workoutDate,
      if (source != null) 'source': source,
      if (exercises != null) 'exercises': exercises,
      if (muscleGroups != null) 'muscle_groups': muscleGroups,
      if (notes != null) 'notes': notes,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  WorkoutRecordsCompanion copyWith(
      {Value<String>? workoutDate,
      Value<String>? source,
      Value<String>? exercises,
      Value<String>? muscleGroups,
      Value<String?>? notes,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return WorkoutRecordsCompanion(
      workoutDate: workoutDate ?? this.workoutDate,
      source: source ?? this.source,
      exercises: exercises ?? this.exercises,
      muscleGroups: muscleGroups ?? this.muscleGroups,
      notes: notes ?? this.notes,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (workoutDate.present) {
      map['workout_date'] = Variable<String>(workoutDate.value);
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (exercises.present) {
      map['exercises'] = Variable<String>(exercises.value);
    }
    if (muscleGroups.present) {
      map['muscle_groups'] = Variable<String>(muscleGroups.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('WorkoutRecordsCompanion(')
          ..write('workoutDate: $workoutDate, ')
          ..write('source: $source, ')
          ..write('exercises: $exercises, ')
          ..write('muscleGroups: $muscleGroups, ')
          ..write('notes: $notes, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $RemindersTable reminders = $RemindersTable(this);
  late final $ReminderPingsTable reminderPings = $ReminderPingsTable(this);
  late final $ConversationsTable conversations = $ConversationsTable(this);
  late final $ChatMessagesTable chatMessages = $ChatMessagesTable(this);
  late final $KeyValuesTable keyValues = $KeyValuesTable(this);
  late final $CoachingProfilesTable coachingProfiles =
      $CoachingProfilesTable(this);
  late final $CheckinsTable checkins = $CheckinsTable(this);
  late final $WorkoutRecordsTable workoutRecords = $WorkoutRecordsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
        reminders,
        reminderPings,
        conversations,
        chatMessages,
        keyValues,
        coachingProfiles,
        checkins,
        workoutRecords
      ];
}

typedef $$RemindersTableCreateCompanionBuilder = RemindersCompanion Function({
  required String id,
  Value<String?> clientId,
  required String title,
  required DateTime remindAt,
  Value<String> status,
  Value<String> leadTimes,
  Value<DateTime?> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<DateTime?> deletedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<int> rowid,
});
typedef $$RemindersTableUpdateCompanionBuilder = RemindersCompanion Function({
  Value<String> id,
  Value<String?> clientId,
  Value<String> title,
  Value<DateTime> remindAt,
  Value<String> status,
  Value<String> leadTimes,
  Value<DateTime?> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<DateTime?> deletedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<int> rowid,
});

class $$RemindersTableFilterComposer
    extends Composer<_$AppDatabase, $RemindersTable> {
  $$RemindersTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get clientId => $composableBuilder(
      column: $table.clientId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get remindAt => $composableBuilder(
      column: $table.remindAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get leadTimes => $composableBuilder(
      column: $table.leadTimes, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get deletedAt => $composableBuilder(
      column: $table.deletedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => ColumnFilters(column));
}

class $$RemindersTableOrderingComposer
    extends Composer<_$AppDatabase, $RemindersTable> {
  $$RemindersTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get clientId => $composableBuilder(
      column: $table.clientId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get remindAt => $composableBuilder(
      column: $table.remindAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get leadTimes => $composableBuilder(
      column: $table.leadTimes, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get deletedAt => $composableBuilder(
      column: $table.deletedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts,
      builder: (column) => ColumnOrderings(column));
}

class $$RemindersTableAnnotationComposer
    extends Composer<_$AppDatabase, $RemindersTable> {
  $$RemindersTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get clientId =>
      $composableBuilder(column: $table.clientId, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<DateTime> get remindAt =>
      $composableBuilder(column: $table.remindAt, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get leadTimes =>
      $composableBuilder(column: $table.leadTimes, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get deletedAt =>
      $composableBuilder(column: $table.deletedAt, builder: (column) => column);

  GeneratedColumn<String> get pendingOp =>
      $composableBuilder(column: $table.pendingOp, builder: (column) => column);

  GeneratedColumn<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => column);
}

class $$RemindersTableTableManager extends RootTableManager<
    _$AppDatabase,
    $RemindersTable,
    LocalReminder,
    $$RemindersTableFilterComposer,
    $$RemindersTableOrderingComposer,
    $$RemindersTableAnnotationComposer,
    $$RemindersTableCreateCompanionBuilder,
    $$RemindersTableUpdateCompanionBuilder,
    (
      LocalReminder,
      BaseReferences<_$AppDatabase, $RemindersTable, LocalReminder>
    ),
    LocalReminder,
    PrefetchHooks Function()> {
  $$RemindersTableTableManager(_$AppDatabase db, $RemindersTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$RemindersTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$RemindersTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$RemindersTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String?> clientId = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<DateTime> remindAt = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<String> leadTimes = const Value.absent(),
            Value<DateTime?> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              RemindersCompanion(
            id: id,
            clientId: clientId,
            title: title,
            remindAt: remindAt,
            status: status,
            leadTimes: leadTimes,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            deletedAt: deletedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            Value<String?> clientId = const Value.absent(),
            required String title,
            required DateTime remindAt,
            Value<String> status = const Value.absent(),
            Value<String> leadTimes = const Value.absent(),
            Value<DateTime?> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              RemindersCompanion.insert(
            id: id,
            clientId: clientId,
            title: title,
            remindAt: remindAt,
            status: status,
            leadTimes: leadTimes,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            deletedAt: deletedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$RemindersTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $RemindersTable,
    LocalReminder,
    $$RemindersTableFilterComposer,
    $$RemindersTableOrderingComposer,
    $$RemindersTableAnnotationComposer,
    $$RemindersTableCreateCompanionBuilder,
    $$RemindersTableUpdateCompanionBuilder,
    (
      LocalReminder,
      BaseReferences<_$AppDatabase, $RemindersTable, LocalReminder>
    ),
    LocalReminder,
    PrefetchHooks Function()>;
typedef $$ReminderPingsTableCreateCompanionBuilder = ReminderPingsCompanion
    Function({
  required String id,
  required String reminderId,
  required DateTime notifyAt,
  required String label,
  Value<DateTime?> sentAt,
  Value<int> rowid,
});
typedef $$ReminderPingsTableUpdateCompanionBuilder = ReminderPingsCompanion
    Function({
  Value<String> id,
  Value<String> reminderId,
  Value<DateTime> notifyAt,
  Value<String> label,
  Value<DateTime?> sentAt,
  Value<int> rowid,
});

class $$ReminderPingsTableFilterComposer
    extends Composer<_$AppDatabase, $ReminderPingsTable> {
  $$ReminderPingsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get reminderId => $composableBuilder(
      column: $table.reminderId, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get notifyAt => $composableBuilder(
      column: $table.notifyAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get label => $composableBuilder(
      column: $table.label, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get sentAt => $composableBuilder(
      column: $table.sentAt, builder: (column) => ColumnFilters(column));
}

class $$ReminderPingsTableOrderingComposer
    extends Composer<_$AppDatabase, $ReminderPingsTable> {
  $$ReminderPingsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get reminderId => $composableBuilder(
      column: $table.reminderId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get notifyAt => $composableBuilder(
      column: $table.notifyAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get label => $composableBuilder(
      column: $table.label, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get sentAt => $composableBuilder(
      column: $table.sentAt, builder: (column) => ColumnOrderings(column));
}

class $$ReminderPingsTableAnnotationComposer
    extends Composer<_$AppDatabase, $ReminderPingsTable> {
  $$ReminderPingsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get reminderId => $composableBuilder(
      column: $table.reminderId, builder: (column) => column);

  GeneratedColumn<DateTime> get notifyAt =>
      $composableBuilder(column: $table.notifyAt, builder: (column) => column);

  GeneratedColumn<String> get label =>
      $composableBuilder(column: $table.label, builder: (column) => column);

  GeneratedColumn<DateTime> get sentAt =>
      $composableBuilder(column: $table.sentAt, builder: (column) => column);
}

class $$ReminderPingsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $ReminderPingsTable,
    LocalPing,
    $$ReminderPingsTableFilterComposer,
    $$ReminderPingsTableOrderingComposer,
    $$ReminderPingsTableAnnotationComposer,
    $$ReminderPingsTableCreateCompanionBuilder,
    $$ReminderPingsTableUpdateCompanionBuilder,
    (LocalPing, BaseReferences<_$AppDatabase, $ReminderPingsTable, LocalPing>),
    LocalPing,
    PrefetchHooks Function()> {
  $$ReminderPingsTableTableManager(_$AppDatabase db, $ReminderPingsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ReminderPingsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ReminderPingsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ReminderPingsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> reminderId = const Value.absent(),
            Value<DateTime> notifyAt = const Value.absent(),
            Value<String> label = const Value.absent(),
            Value<DateTime?> sentAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ReminderPingsCompanion(
            id: id,
            reminderId: reminderId,
            notifyAt: notifyAt,
            label: label,
            sentAt: sentAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String reminderId,
            required DateTime notifyAt,
            required String label,
            Value<DateTime?> sentAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ReminderPingsCompanion.insert(
            id: id,
            reminderId: reminderId,
            notifyAt: notifyAt,
            label: label,
            sentAt: sentAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$ReminderPingsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $ReminderPingsTable,
    LocalPing,
    $$ReminderPingsTableFilterComposer,
    $$ReminderPingsTableOrderingComposer,
    $$ReminderPingsTableAnnotationComposer,
    $$ReminderPingsTableCreateCompanionBuilder,
    $$ReminderPingsTableUpdateCompanionBuilder,
    (LocalPing, BaseReferences<_$AppDatabase, $ReminderPingsTable, LocalPing>),
    LocalPing,
    PrefetchHooks Function()>;
typedef $$ConversationsTableCreateCompanionBuilder = ConversationsCompanion
    Function({
  required String id,
  Value<String> title,
  Value<bool> pinned,
  Value<bool> archived,
  Value<bool> isCoaching,
  Value<DateTime?> lastMessageAt,
  Value<DateTime?> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<int> rowid,
});
typedef $$ConversationsTableUpdateCompanionBuilder = ConversationsCompanion
    Function({
  Value<String> id,
  Value<String> title,
  Value<bool> pinned,
  Value<bool> archived,
  Value<bool> isCoaching,
  Value<DateTime?> lastMessageAt,
  Value<DateTime?> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<int> rowid,
});

class $$ConversationsTableFilterComposer
    extends Composer<_$AppDatabase, $ConversationsTable> {
  $$ConversationsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get pinned => $composableBuilder(
      column: $table.pinned, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get archived => $composableBuilder(
      column: $table.archived, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get isCoaching => $composableBuilder(
      column: $table.isCoaching, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get lastMessageAt => $composableBuilder(
      column: $table.lastMessageAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => ColumnFilters(column));
}

class $$ConversationsTableOrderingComposer
    extends Composer<_$AppDatabase, $ConversationsTable> {
  $$ConversationsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get pinned => $composableBuilder(
      column: $table.pinned, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get archived => $composableBuilder(
      column: $table.archived, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get isCoaching => $composableBuilder(
      column: $table.isCoaching, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get lastMessageAt => $composableBuilder(
      column: $table.lastMessageAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts,
      builder: (column) => ColumnOrderings(column));
}

class $$ConversationsTableAnnotationComposer
    extends Composer<_$AppDatabase, $ConversationsTable> {
  $$ConversationsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<bool> get pinned =>
      $composableBuilder(column: $table.pinned, builder: (column) => column);

  GeneratedColumn<bool> get archived =>
      $composableBuilder(column: $table.archived, builder: (column) => column);

  GeneratedColumn<bool> get isCoaching => $composableBuilder(
      column: $table.isCoaching, builder: (column) => column);

  GeneratedColumn<DateTime> get lastMessageAt => $composableBuilder(
      column: $table.lastMessageAt, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt, builder: (column) => column);

  GeneratedColumn<String> get pendingOp =>
      $composableBuilder(column: $table.pendingOp, builder: (column) => column);

  GeneratedColumn<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => column);
}

class $$ConversationsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $ConversationsTable,
    LocalConversation,
    $$ConversationsTableFilterComposer,
    $$ConversationsTableOrderingComposer,
    $$ConversationsTableAnnotationComposer,
    $$ConversationsTableCreateCompanionBuilder,
    $$ConversationsTableUpdateCompanionBuilder,
    (
      LocalConversation,
      BaseReferences<_$AppDatabase, $ConversationsTable, LocalConversation>
    ),
    LocalConversation,
    PrefetchHooks Function()> {
  $$ConversationsTableTableManager(_$AppDatabase db, $ConversationsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ConversationsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ConversationsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ConversationsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<bool> pinned = const Value.absent(),
            Value<bool> archived = const Value.absent(),
            Value<bool> isCoaching = const Value.absent(),
            Value<DateTime?> lastMessageAt = const Value.absent(),
            Value<DateTime?> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ConversationsCompanion(
            id: id,
            title: title,
            pinned: pinned,
            archived: archived,
            isCoaching: isCoaching,
            lastMessageAt: lastMessageAt,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            Value<String> title = const Value.absent(),
            Value<bool> pinned = const Value.absent(),
            Value<bool> archived = const Value.absent(),
            Value<bool> isCoaching = const Value.absent(),
            Value<DateTime?> lastMessageAt = const Value.absent(),
            Value<DateTime?> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ConversationsCompanion.insert(
            id: id,
            title: title,
            pinned: pinned,
            archived: archived,
            isCoaching: isCoaching,
            lastMessageAt: lastMessageAt,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$ConversationsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $ConversationsTable,
    LocalConversation,
    $$ConversationsTableFilterComposer,
    $$ConversationsTableOrderingComposer,
    $$ConversationsTableAnnotationComposer,
    $$ConversationsTableCreateCompanionBuilder,
    $$ConversationsTableUpdateCompanionBuilder,
    (
      LocalConversation,
      BaseReferences<_$AppDatabase, $ConversationsTable, LocalConversation>
    ),
    LocalConversation,
    PrefetchHooks Function()>;
typedef $$ChatMessagesTableCreateCompanionBuilder = ChatMessagesCompanion
    Function({
  Value<int> localId,
  Value<int?> serverId,
  Value<String?> clientId,
  Value<String?> conversationId,
  required String role,
  required String content,
  required DateTime composedAt,
  Value<String> syncState,
});
typedef $$ChatMessagesTableUpdateCompanionBuilder = ChatMessagesCompanion
    Function({
  Value<int> localId,
  Value<int?> serverId,
  Value<String?> clientId,
  Value<String?> conversationId,
  Value<String> role,
  Value<String> content,
  Value<DateTime> composedAt,
  Value<String> syncState,
});

class $$ChatMessagesTableFilterComposer
    extends Composer<_$AppDatabase, $ChatMessagesTable> {
  $$ChatMessagesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get localId => $composableBuilder(
      column: $table.localId, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get serverId => $composableBuilder(
      column: $table.serverId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get clientId => $composableBuilder(
      column: $table.clientId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get conversationId => $composableBuilder(
      column: $table.conversationId,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get role => $composableBuilder(
      column: $table.role, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get content => $composableBuilder(
      column: $table.content, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get composedAt => $composableBuilder(
      column: $table.composedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get syncState => $composableBuilder(
      column: $table.syncState, builder: (column) => ColumnFilters(column));
}

class $$ChatMessagesTableOrderingComposer
    extends Composer<_$AppDatabase, $ChatMessagesTable> {
  $$ChatMessagesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get localId => $composableBuilder(
      column: $table.localId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get serverId => $composableBuilder(
      column: $table.serverId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get clientId => $composableBuilder(
      column: $table.clientId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get conversationId => $composableBuilder(
      column: $table.conversationId,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get role => $composableBuilder(
      column: $table.role, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get content => $composableBuilder(
      column: $table.content, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get composedAt => $composableBuilder(
      column: $table.composedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get syncState => $composableBuilder(
      column: $table.syncState, builder: (column) => ColumnOrderings(column));
}

class $$ChatMessagesTableAnnotationComposer
    extends Composer<_$AppDatabase, $ChatMessagesTable> {
  $$ChatMessagesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get localId =>
      $composableBuilder(column: $table.localId, builder: (column) => column);

  GeneratedColumn<int> get serverId =>
      $composableBuilder(column: $table.serverId, builder: (column) => column);

  GeneratedColumn<String> get clientId =>
      $composableBuilder(column: $table.clientId, builder: (column) => column);

  GeneratedColumn<String> get conversationId => $composableBuilder(
      column: $table.conversationId, builder: (column) => column);

  GeneratedColumn<String> get role =>
      $composableBuilder(column: $table.role, builder: (column) => column);

  GeneratedColumn<String> get content =>
      $composableBuilder(column: $table.content, builder: (column) => column);

  GeneratedColumn<DateTime> get composedAt => $composableBuilder(
      column: $table.composedAt, builder: (column) => column);

  GeneratedColumn<String> get syncState =>
      $composableBuilder(column: $table.syncState, builder: (column) => column);
}

class $$ChatMessagesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $ChatMessagesTable,
    LocalMessage,
    $$ChatMessagesTableFilterComposer,
    $$ChatMessagesTableOrderingComposer,
    $$ChatMessagesTableAnnotationComposer,
    $$ChatMessagesTableCreateCompanionBuilder,
    $$ChatMessagesTableUpdateCompanionBuilder,
    (
      LocalMessage,
      BaseReferences<_$AppDatabase, $ChatMessagesTable, LocalMessage>
    ),
    LocalMessage,
    PrefetchHooks Function()> {
  $$ChatMessagesTableTableManager(_$AppDatabase db, $ChatMessagesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ChatMessagesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ChatMessagesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ChatMessagesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<int> localId = const Value.absent(),
            Value<int?> serverId = const Value.absent(),
            Value<String?> clientId = const Value.absent(),
            Value<String?> conversationId = const Value.absent(),
            Value<String> role = const Value.absent(),
            Value<String> content = const Value.absent(),
            Value<DateTime> composedAt = const Value.absent(),
            Value<String> syncState = const Value.absent(),
          }) =>
              ChatMessagesCompanion(
            localId: localId,
            serverId: serverId,
            clientId: clientId,
            conversationId: conversationId,
            role: role,
            content: content,
            composedAt: composedAt,
            syncState: syncState,
          ),
          createCompanionCallback: ({
            Value<int> localId = const Value.absent(),
            Value<int?> serverId = const Value.absent(),
            Value<String?> clientId = const Value.absent(),
            Value<String?> conversationId = const Value.absent(),
            required String role,
            required String content,
            required DateTime composedAt,
            Value<String> syncState = const Value.absent(),
          }) =>
              ChatMessagesCompanion.insert(
            localId: localId,
            serverId: serverId,
            clientId: clientId,
            conversationId: conversationId,
            role: role,
            content: content,
            composedAt: composedAt,
            syncState: syncState,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$ChatMessagesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $ChatMessagesTable,
    LocalMessage,
    $$ChatMessagesTableFilterComposer,
    $$ChatMessagesTableOrderingComposer,
    $$ChatMessagesTableAnnotationComposer,
    $$ChatMessagesTableCreateCompanionBuilder,
    $$ChatMessagesTableUpdateCompanionBuilder,
    (
      LocalMessage,
      BaseReferences<_$AppDatabase, $ChatMessagesTable, LocalMessage>
    ),
    LocalMessage,
    PrefetchHooks Function()>;
typedef $$KeyValuesTableCreateCompanionBuilder = KeyValuesCompanion Function({
  required String k,
  required String v,
  Value<int> rowid,
});
typedef $$KeyValuesTableUpdateCompanionBuilder = KeyValuesCompanion Function({
  Value<String> k,
  Value<String> v,
  Value<int> rowid,
});

class $$KeyValuesTableFilterComposer
    extends Composer<_$AppDatabase, $KeyValuesTable> {
  $$KeyValuesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get k => $composableBuilder(
      column: $table.k, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get v => $composableBuilder(
      column: $table.v, builder: (column) => ColumnFilters(column));
}

class $$KeyValuesTableOrderingComposer
    extends Composer<_$AppDatabase, $KeyValuesTable> {
  $$KeyValuesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get k => $composableBuilder(
      column: $table.k, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get v => $composableBuilder(
      column: $table.v, builder: (column) => ColumnOrderings(column));
}

class $$KeyValuesTableAnnotationComposer
    extends Composer<_$AppDatabase, $KeyValuesTable> {
  $$KeyValuesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get k =>
      $composableBuilder(column: $table.k, builder: (column) => column);

  GeneratedColumn<String> get v =>
      $composableBuilder(column: $table.v, builder: (column) => column);
}

class $$KeyValuesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $KeyValuesTable,
    KeyValue,
    $$KeyValuesTableFilterComposer,
    $$KeyValuesTableOrderingComposer,
    $$KeyValuesTableAnnotationComposer,
    $$KeyValuesTableCreateCompanionBuilder,
    $$KeyValuesTableUpdateCompanionBuilder,
    (KeyValue, BaseReferences<_$AppDatabase, $KeyValuesTable, KeyValue>),
    KeyValue,
    PrefetchHooks Function()> {
  $$KeyValuesTableTableManager(_$AppDatabase db, $KeyValuesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$KeyValuesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$KeyValuesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$KeyValuesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> k = const Value.absent(),
            Value<String> v = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              KeyValuesCompanion(
            k: k,
            v: v,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String k,
            required String v,
            Value<int> rowid = const Value.absent(),
          }) =>
              KeyValuesCompanion.insert(
            k: k,
            v: v,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$KeyValuesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $KeyValuesTable,
    KeyValue,
    $$KeyValuesTableFilterComposer,
    $$KeyValuesTableOrderingComposer,
    $$KeyValuesTableAnnotationComposer,
    $$KeyValuesTableCreateCompanionBuilder,
    $$KeyValuesTableUpdateCompanionBuilder,
    (KeyValue, BaseReferences<_$AppDatabase, $KeyValuesTable, KeyValue>),
    KeyValue,
    PrefetchHooks Function()>;
typedef $$CoachingProfilesTableCreateCompanionBuilder
    = CoachingProfilesCompanion Function({
  Value<int> id,
  Value<bool> optedIn,
  Value<String> timezone,
  Value<String> trainingDays,
  Value<String> allergies,
  Value<String?> gymTime,
  Value<String?> checkinTime,
  Value<String?> programTime,
  Value<String?> language,
  Value<bool> awaitingCheckin,
  Value<DateTime?> awaitingSince,
  Value<bool> dirty,
  Value<DateTime?> updatedAt,
});
typedef $$CoachingProfilesTableUpdateCompanionBuilder
    = CoachingProfilesCompanion Function({
  Value<int> id,
  Value<bool> optedIn,
  Value<String> timezone,
  Value<String> trainingDays,
  Value<String> allergies,
  Value<String?> gymTime,
  Value<String?> checkinTime,
  Value<String?> programTime,
  Value<String?> language,
  Value<bool> awaitingCheckin,
  Value<DateTime?> awaitingSince,
  Value<bool> dirty,
  Value<DateTime?> updatedAt,
});

class $$CoachingProfilesTableFilterComposer
    extends Composer<_$AppDatabase, $CoachingProfilesTable> {
  $$CoachingProfilesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get optedIn => $composableBuilder(
      column: $table.optedIn, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get timezone => $composableBuilder(
      column: $table.timezone, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get trainingDays => $composableBuilder(
      column: $table.trainingDays, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get allergies => $composableBuilder(
      column: $table.allergies, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get gymTime => $composableBuilder(
      column: $table.gymTime, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get checkinTime => $composableBuilder(
      column: $table.checkinTime, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get programTime => $composableBuilder(
      column: $table.programTime, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get language => $composableBuilder(
      column: $table.language, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get awaitingCheckin => $composableBuilder(
      column: $table.awaitingCheckin,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get awaitingSince => $composableBuilder(
      column: $table.awaitingSince, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get dirty => $composableBuilder(
      column: $table.dirty, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));
}

class $$CoachingProfilesTableOrderingComposer
    extends Composer<_$AppDatabase, $CoachingProfilesTable> {
  $$CoachingProfilesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get optedIn => $composableBuilder(
      column: $table.optedIn, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get timezone => $composableBuilder(
      column: $table.timezone, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get trainingDays => $composableBuilder(
      column: $table.trainingDays,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get allergies => $composableBuilder(
      column: $table.allergies, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get gymTime => $composableBuilder(
      column: $table.gymTime, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get checkinTime => $composableBuilder(
      column: $table.checkinTime, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get programTime => $composableBuilder(
      column: $table.programTime, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get language => $composableBuilder(
      column: $table.language, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get awaitingCheckin => $composableBuilder(
      column: $table.awaitingCheckin,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get awaitingSince => $composableBuilder(
      column: $table.awaitingSince,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get dirty => $composableBuilder(
      column: $table.dirty, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));
}

class $$CoachingProfilesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CoachingProfilesTable> {
  $$CoachingProfilesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<bool> get optedIn =>
      $composableBuilder(column: $table.optedIn, builder: (column) => column);

  GeneratedColumn<String> get timezone =>
      $composableBuilder(column: $table.timezone, builder: (column) => column);

  GeneratedColumn<String> get trainingDays => $composableBuilder(
      column: $table.trainingDays, builder: (column) => column);

  GeneratedColumn<String> get allergies =>
      $composableBuilder(column: $table.allergies, builder: (column) => column);

  GeneratedColumn<String> get gymTime =>
      $composableBuilder(column: $table.gymTime, builder: (column) => column);

  GeneratedColumn<String> get checkinTime => $composableBuilder(
      column: $table.checkinTime, builder: (column) => column);

  GeneratedColumn<String> get programTime => $composableBuilder(
      column: $table.programTime, builder: (column) => column);

  GeneratedColumn<String> get language =>
      $composableBuilder(column: $table.language, builder: (column) => column);

  GeneratedColumn<bool> get awaitingCheckin => $composableBuilder(
      column: $table.awaitingCheckin, builder: (column) => column);

  GeneratedColumn<DateTime> get awaitingSince => $composableBuilder(
      column: $table.awaitingSince, builder: (column) => column);

  GeneratedColumn<bool> get dirty =>
      $composableBuilder(column: $table.dirty, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$CoachingProfilesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CoachingProfilesTable,
    LocalProfile,
    $$CoachingProfilesTableFilterComposer,
    $$CoachingProfilesTableOrderingComposer,
    $$CoachingProfilesTableAnnotationComposer,
    $$CoachingProfilesTableCreateCompanionBuilder,
    $$CoachingProfilesTableUpdateCompanionBuilder,
    (
      LocalProfile,
      BaseReferences<_$AppDatabase, $CoachingProfilesTable, LocalProfile>
    ),
    LocalProfile,
    PrefetchHooks Function()> {
  $$CoachingProfilesTableTableManager(
      _$AppDatabase db, $CoachingProfilesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CoachingProfilesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CoachingProfilesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CoachingProfilesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<int> id = const Value.absent(),
            Value<bool> optedIn = const Value.absent(),
            Value<String> timezone = const Value.absent(),
            Value<String> trainingDays = const Value.absent(),
            Value<String> allergies = const Value.absent(),
            Value<String?> gymTime = const Value.absent(),
            Value<String?> checkinTime = const Value.absent(),
            Value<String?> programTime = const Value.absent(),
            Value<String?> language = const Value.absent(),
            Value<bool> awaitingCheckin = const Value.absent(),
            Value<DateTime?> awaitingSince = const Value.absent(),
            Value<bool> dirty = const Value.absent(),
            Value<DateTime?> updatedAt = const Value.absent(),
          }) =>
              CoachingProfilesCompanion(
            id: id,
            optedIn: optedIn,
            timezone: timezone,
            trainingDays: trainingDays,
            allergies: allergies,
            gymTime: gymTime,
            checkinTime: checkinTime,
            programTime: programTime,
            language: language,
            awaitingCheckin: awaitingCheckin,
            awaitingSince: awaitingSince,
            dirty: dirty,
            updatedAt: updatedAt,
          ),
          createCompanionCallback: ({
            Value<int> id = const Value.absent(),
            Value<bool> optedIn = const Value.absent(),
            Value<String> timezone = const Value.absent(),
            Value<String> trainingDays = const Value.absent(),
            Value<String> allergies = const Value.absent(),
            Value<String?> gymTime = const Value.absent(),
            Value<String?> checkinTime = const Value.absent(),
            Value<String?> programTime = const Value.absent(),
            Value<String?> language = const Value.absent(),
            Value<bool> awaitingCheckin = const Value.absent(),
            Value<DateTime?> awaitingSince = const Value.absent(),
            Value<bool> dirty = const Value.absent(),
            Value<DateTime?> updatedAt = const Value.absent(),
          }) =>
              CoachingProfilesCompanion.insert(
            id: id,
            optedIn: optedIn,
            timezone: timezone,
            trainingDays: trainingDays,
            allergies: allergies,
            gymTime: gymTime,
            checkinTime: checkinTime,
            programTime: programTime,
            language: language,
            awaitingCheckin: awaitingCheckin,
            awaitingSince: awaitingSince,
            dirty: dirty,
            updatedAt: updatedAt,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$CoachingProfilesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $CoachingProfilesTable,
    LocalProfile,
    $$CoachingProfilesTableFilterComposer,
    $$CoachingProfilesTableOrderingComposer,
    $$CoachingProfilesTableAnnotationComposer,
    $$CoachingProfilesTableCreateCompanionBuilder,
    $$CoachingProfilesTableUpdateCompanionBuilder,
    (
      LocalProfile,
      BaseReferences<_$AppDatabase, $CoachingProfilesTable, LocalProfile>
    ),
    LocalProfile,
    PrefetchHooks Function()>;
typedef $$CheckinsTableCreateCompanionBuilder = CheckinsCompanion Function({
  required String checkinDate,
  required bool adhered,
  Value<String?> rawReply,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$CheckinsTableUpdateCompanionBuilder = CheckinsCompanion Function({
  Value<String> checkinDate,
  Value<bool> adhered,
  Value<String?> rawReply,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$CheckinsTableFilterComposer
    extends Composer<_$AppDatabase, $CheckinsTable> {
  $$CheckinsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get checkinDate => $composableBuilder(
      column: $table.checkinDate, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get adhered => $composableBuilder(
      column: $table.adhered, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get rawReply => $composableBuilder(
      column: $table.rawReply, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$CheckinsTableOrderingComposer
    extends Composer<_$AppDatabase, $CheckinsTable> {
  $$CheckinsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get checkinDate => $composableBuilder(
      column: $table.checkinDate, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get adhered => $composableBuilder(
      column: $table.adhered, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get rawReply => $composableBuilder(
      column: $table.rawReply, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$CheckinsTableAnnotationComposer
    extends Composer<_$AppDatabase, $CheckinsTable> {
  $$CheckinsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get checkinDate => $composableBuilder(
      column: $table.checkinDate, builder: (column) => column);

  GeneratedColumn<bool> get adhered =>
      $composableBuilder(column: $table.adhered, builder: (column) => column);

  GeneratedColumn<String> get rawReply =>
      $composableBuilder(column: $table.rawReply, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$CheckinsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CheckinsTable,
    LocalCheckin,
    $$CheckinsTableFilterComposer,
    $$CheckinsTableOrderingComposer,
    $$CheckinsTableAnnotationComposer,
    $$CheckinsTableCreateCompanionBuilder,
    $$CheckinsTableUpdateCompanionBuilder,
    (LocalCheckin, BaseReferences<_$AppDatabase, $CheckinsTable, LocalCheckin>),
    LocalCheckin,
    PrefetchHooks Function()> {
  $$CheckinsTableTableManager(_$AppDatabase db, $CheckinsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CheckinsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CheckinsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CheckinsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> checkinDate = const Value.absent(),
            Value<bool> adhered = const Value.absent(),
            Value<String?> rawReply = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CheckinsCompanion(
            checkinDate: checkinDate,
            adhered: adhered,
            rawReply: rawReply,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String checkinDate,
            required bool adhered,
            Value<String?> rawReply = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              CheckinsCompanion.insert(
            checkinDate: checkinDate,
            adhered: adhered,
            rawReply: rawReply,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$CheckinsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $CheckinsTable,
    LocalCheckin,
    $$CheckinsTableFilterComposer,
    $$CheckinsTableOrderingComposer,
    $$CheckinsTableAnnotationComposer,
    $$CheckinsTableCreateCompanionBuilder,
    $$CheckinsTableUpdateCompanionBuilder,
    (LocalCheckin, BaseReferences<_$AppDatabase, $CheckinsTable, LocalCheckin>),
    LocalCheckin,
    PrefetchHooks Function()>;
typedef $$WorkoutRecordsTableCreateCompanionBuilder = WorkoutRecordsCompanion
    Function({
  required String workoutDate,
  required String source,
  Value<String> exercises,
  Value<String> muscleGroups,
  Value<String?> notes,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$WorkoutRecordsTableUpdateCompanionBuilder = WorkoutRecordsCompanion
    Function({
  Value<String> workoutDate,
  Value<String> source,
  Value<String> exercises,
  Value<String> muscleGroups,
  Value<String?> notes,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$WorkoutRecordsTableFilterComposer
    extends Composer<_$AppDatabase, $WorkoutRecordsTable> {
  $$WorkoutRecordsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get workoutDate => $composableBuilder(
      column: $table.workoutDate, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get exercises => $composableBuilder(
      column: $table.exercises, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get muscleGroups => $composableBuilder(
      column: $table.muscleGroups, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get notes => $composableBuilder(
      column: $table.notes, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$WorkoutRecordsTableOrderingComposer
    extends Composer<_$AppDatabase, $WorkoutRecordsTable> {
  $$WorkoutRecordsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get workoutDate => $composableBuilder(
      column: $table.workoutDate, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get exercises => $composableBuilder(
      column: $table.exercises, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get muscleGroups => $composableBuilder(
      column: $table.muscleGroups,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get notes => $composableBuilder(
      column: $table.notes, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$WorkoutRecordsTableAnnotationComposer
    extends Composer<_$AppDatabase, $WorkoutRecordsTable> {
  $$WorkoutRecordsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get workoutDate => $composableBuilder(
      column: $table.workoutDate, builder: (column) => column);

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<String> get exercises =>
      $composableBuilder(column: $table.exercises, builder: (column) => column);

  GeneratedColumn<String> get muscleGroups => $composableBuilder(
      column: $table.muscleGroups, builder: (column) => column);

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$WorkoutRecordsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $WorkoutRecordsTable,
    LocalWorkout,
    $$WorkoutRecordsTableFilterComposer,
    $$WorkoutRecordsTableOrderingComposer,
    $$WorkoutRecordsTableAnnotationComposer,
    $$WorkoutRecordsTableCreateCompanionBuilder,
    $$WorkoutRecordsTableUpdateCompanionBuilder,
    (
      LocalWorkout,
      BaseReferences<_$AppDatabase, $WorkoutRecordsTable, LocalWorkout>
    ),
    LocalWorkout,
    PrefetchHooks Function()> {
  $$WorkoutRecordsTableTableManager(
      _$AppDatabase db, $WorkoutRecordsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$WorkoutRecordsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$WorkoutRecordsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$WorkoutRecordsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> workoutDate = const Value.absent(),
            Value<String> source = const Value.absent(),
            Value<String> exercises = const Value.absent(),
            Value<String> muscleGroups = const Value.absent(),
            Value<String?> notes = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              WorkoutRecordsCompanion(
            workoutDate: workoutDate,
            source: source,
            exercises: exercises,
            muscleGroups: muscleGroups,
            notes: notes,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String workoutDate,
            required String source,
            Value<String> exercises = const Value.absent(),
            Value<String> muscleGroups = const Value.absent(),
            Value<String?> notes = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              WorkoutRecordsCompanion.insert(
            workoutDate: workoutDate,
            source: source,
            exercises: exercises,
            muscleGroups: muscleGroups,
            notes: notes,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$WorkoutRecordsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $WorkoutRecordsTable,
    LocalWorkout,
    $$WorkoutRecordsTableFilterComposer,
    $$WorkoutRecordsTableOrderingComposer,
    $$WorkoutRecordsTableAnnotationComposer,
    $$WorkoutRecordsTableCreateCompanionBuilder,
    $$WorkoutRecordsTableUpdateCompanionBuilder,
    (
      LocalWorkout,
      BaseReferences<_$AppDatabase, $WorkoutRecordsTable, LocalWorkout>
    ),
    LocalWorkout,
    PrefetchHooks Function()>;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$RemindersTableTableManager get reminders =>
      $$RemindersTableTableManager(_db, _db.reminders);
  $$ReminderPingsTableTableManager get reminderPings =>
      $$ReminderPingsTableTableManager(_db, _db.reminderPings);
  $$ConversationsTableTableManager get conversations =>
      $$ConversationsTableTableManager(_db, _db.conversations);
  $$ChatMessagesTableTableManager get chatMessages =>
      $$ChatMessagesTableTableManager(_db, _db.chatMessages);
  $$KeyValuesTableTableManager get keyValues =>
      $$KeyValuesTableTableManager(_db, _db.keyValues);
  $$CoachingProfilesTableTableManager get coachingProfiles =>
      $$CoachingProfilesTableTableManager(_db, _db.coachingProfiles);
  $$CheckinsTableTableManager get checkins =>
      $$CheckinsTableTableManager(_db, _db.checkins);
  $$WorkoutRecordsTableTableManager get workoutRecords =>
      $$WorkoutRecordsTableTableManager(_db, _db.workoutRecords);
}
