import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth';
import { api, ApiError } from '@/api';
import { Avatar, Badge, Loading } from '@/ui';
import { colors, radius, shadow } from '@/theme';
import type { Resident } from '@/types';

export default function ResidentsList() {
  const { can, user } = useAuth();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<Resident[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (opts: { reset?: boolean; silent?: boolean } = {}) => {
    if (!can('read') && !can('search')) { setLoading(false); setError('Your role cannot view residents.'); return; }
    const nextPage = opts.reset ? 1 : page;
    if (!opts.silent) setLoading(true);
    setError('');
    try {
      const res = await api.listResidents({ search: debounced || undefined, page: nextPage, limit: 30 });
      setTotal(res.total);
      setPage(res.page);
      setItems(prev => (opts.reset || res.page === 1) ? res.data : [...prev, ...res.data]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debounced, page, can]);

  useEffect(() => { load({ reset: true }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load({ reset: true, silent: true }); }, [debounced])); // eslint-disable-line react-hooks/exhaustive-deps

  const canCreate = can('create');

  const renderItem = ({ item }: { item: Resident }) => {
    const name = [item.first_name, item.middle_name, item.last_name, item.suffix].filter(Boolean).join(' ');
    return (
      <TouchableOpacity style={styles.row} onPress={() => router.push(`/(app)/residents/${item.id}`)} activeOpacity={0.7}>
        <Avatar name={`${item.first_name} ${item.last_name}`} size={42} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.sub}>
            {item.gender}{item.age != null ? ` · ${item.age} yrs` : ''}{item.purok ? ` · Purok ${item.purok}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {!!item.is_pwd && <Badge text="PWD" tone="primary" />}
          {!!item.is_indigent && <Badge text="Indigent" tone="warn" />}
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            placeholder="Search residents..."
            placeholderTextColor={colors.faint}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={() => router.push('/(app)/scan')} activeOpacity={0.8}>
          <Text style={{ fontSize: 18 }}>📷</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Loading text="Loading residents..." />
      ) : error ? (
        <View style={{ padding: 24 }}><Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
          ListHeaderComponent={<Text style={styles.count}>{total.toLocaleString()} resident{total === 1 ? '' : 's'}{user?.role ? ` · ${user.role}` : ''}</Text>}
          ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>No residents found.</Text>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ reset: true, silent: true }); }} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (items.length < total && !loading) { setPage(p => p + 1); load({ silent: true }); } }}
        />
      )}

      {canCreate && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/(app)/residents/new')} activeOpacity={0.85}>
          <Text style={{ color: '#fff', fontSize: 28, marginTop: -2 }}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 4 },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius, paddingHorizontal: 10, ...shadow,
  },
  searchIcon: { color: colors.faint, fontSize: 17, marginRight: 4 },
  searchInput: { flex: 1, paddingVertical: 10, color: colors.text, fontSize: 15 },
  scanBtn: {
    width: 44, borderRadius: radius, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', ...shadow,
  },
  count: { color: colors.faint, fontSize: 12, fontWeight: '600', marginBottom: 8, marginLeft: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius + 2,
    borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, ...shadow,
  },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  chevron: { color: colors.faint, fontSize: 22, marginLeft: 8, marginTop: -2 },
  fab: {
    position: 'absolute', right: 18, bottom: 22, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
});
