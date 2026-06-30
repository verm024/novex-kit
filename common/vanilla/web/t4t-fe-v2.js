import Fetch from '../iso/fetch.js';

let tableName = '';
let parentFilter = null;
let config = null;
let urlPrefix = '/api';
let http = new Fetch();

function setTableName(name) {
  tableName = name;
}

const setFetch = _fetch => (http = _fetch);

const setParentFilter = _filter => (parentFilter = _filter);

const setUrlPrefix = _urlPrefix => (urlPrefix = _urlPrefix);

async function getConfig() {
  const { data } = await http.get(`${urlPrefix}/${tableName}/config`);
  if (data) config = data;
  return data;
}

async function find(filters, sorter, page, limit) {
  const rv = { results: [], total: 0 };
  if (parentFilter) {
    filters.push({ col: parentFilter.col, op: '=', val: parentFilter.id, andOr: 'and' });
  }
  filters = filters ? JSON.stringify(filters) : '';
  sorter = sorter ? JSON.stringify(sorter) : '';
  const { data } = await http.get(`${urlPrefix}/${tableName}/`, {
    page,
    limit,
    filters,
    sorter,
  });
  rv.results = data.results;
  rv.total = data.total;
  return rv;
}

async function download(filters, sorter) {
  const { data } = await http.get(`${urlPrefix}/${tableName}/`, {
    page: 0,
    limit: 0,
    filters: filters ? JSON.stringify(filters) : '',
    sorter: sorter ? JSON.stringify(sorter) : '',
    csv: 1,
  });
  return data;
}

async function findOne(__key) {
  const { data } = await http.get(`${urlPrefix}/${tableName}/${encodeURIComponent(__key)}`);
  if (data) {
    data.__key = __key;
    return data;
  }
  return {};
}

function processFileList(fileList, rv, signedUrl) {
  const names = [];
  for (const file of fileList) {
    if (signedUrl) {
      if (!rv.files) rv.files = [];
      rv.files.push(file);
    } else {
      if (!rv.form) rv.form = new FormData();
      rv.form.append('file-data', file);
    }
    names.push(file.name);
  }
  return names.join(',');
}

function processData(record, { signedUrl = false } = {}) {
  const rv = { json: {} };
  for (const [k, v] of Object.entries(record)) {
    if (v instanceof FileList) {
      rv.json[k] = processFileList(v, rv, signedUrl);
    } else {
      rv.json[k] = v;
    }
  }
  if (rv.form) rv.form.append('json-data', JSON.stringify(rv.json));
  return rv;
}

async function create(record) {
  return await http.post(`${urlPrefix}/${tableName}/`, record);
}

async function update(__key, record, headers = null) {
  return await http.patch(`${urlPrefix}/${tableName}/${encodeURIComponent(__key)}`, record, null, headers);
}

async function remove(items) {
  return await http.post(`${urlPrefix}/${tableName}/delete`, { ids: items });
}

async function upload(file) {
  if (file === null) return false;
  const formData = new FormData();
  formData.append('file', file);
  return await http.post(`${urlPrefix}/${tableName}/upload`, formData);
}

async function autocomplete(search, col, record, parentColVal = '') {
  const colConfig = config?.cols?.[col];
  if (!colConfig?.options?.text) return [];
  const { data } = await http.post(`${urlPrefix}/${tableName}/autocomplete`, {
    key: colConfig.options.key || col.replace(/(Id|id)$/, ''),
    text: colConfig.options.text,
    search,
    limit: 20,
  });
  return data;
}

export {
  autocomplete,
  create,
  download,
  find,
  findOne,
  getConfig,
  processData,
  remove,
  setFetch,
  setParentFilter,
  setTableName,
  setUrlPrefix,
  update,
  upload,
};
