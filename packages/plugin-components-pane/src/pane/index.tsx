// 导入React核心库
import React from 'react';
// 导入Fusion Design的搜索组件
import { Search } from '@alifd/next';
// 导入阿里低代码引擎的插件属性类型定义
import { PluginProps } from '@alilc/lowcode-types';
// 导入classnames库的绑定版本，用于CSS类名处理
import cls from 'classnames/bind';
// 导入lodash的防抖函数
import debounce from 'lodash.debounce';
// 导入当前组件的样式文件
import style from './index.module.scss';
// 导入面板图标组件
import IconOfPane from '../Icon';
// 导入分类组件
import Category from '../components/Category';
// 导入列表组件
import List from '../components/List';
// 导入单个组件显示组件
import Component from '../components/Component';
// 导入选项卡组件
import Tab from '../components/Tab';
// 导入组件管理器
import ComponentManager from '../store';
// 导入数据转换函数和相关类型定义
import transform, { getTextReader, SortedGroups, Text, StandardComponentMeta, SnippetMeta, createI18n } from '../utils/transform';

// 从全局变量中解构阿里低代码引擎的核心API
const { material, common, project, event } = window.AliLowCodeEngine || {};

// 判断是否为新版本引擎（通过material API是否存在来判断）
const isNewEngineVersion = !!material;

// 创建组件管理器实例
const store = new ComponentManager();

// 绑定样式类名处理函数
const cx = cls.bind(style);

// 定义组件面板的属性接口，继承自插件属性
interface ComponentPaneProps extends PluginProps {
  [key: string]: any;
}

// 定义组件面板的状态接口
interface ComponentPaneState {
  groups: SortedGroups[];  // 组件分组数据
  filter: SortedGroups[];  // 过滤后的组件数据
  keyword: string;         // 搜索关键词
}

// 导出组件面板类，继承自React.Component
export default class ComponentPane extends React.Component<ComponentPaneProps, ComponentPaneState> {
  // 设置组件的显示名称，用于React开发工具
  static displayName = 'LowcodeComponentPane';

  // 设置组件的默认属性
  static defaultProps = {
    lang: 'zh_CN',  // 默认语言为简体中文
  };

  // 初始化组件状态
  state: ComponentPaneState = {
    groups: [],   // 初始组件分组为空数组
    filter: [],   // 初始过滤结果为空数组
    keyword: '',  // 初始搜索关键词为空字符串
  };

  // 引用组件管理器实例
  store = store;

  // 文本翻译函数的类型定义
  t: (input: Text) => string;

  // 获取字符串关键词的函数类型定义
  getStrKeywords: (keywords: Text[]) => string;

  // 获取组件用于搜索的关键字字符串
  getKeyToSearch (c:StandardComponentMeta|SnippetMeta){
    // 获取组件标题的翻译文本
    const strTitle = this.t(c.title);
    // 获取组件名称的翻译文本（如果是SnippetMeta类型）
    const strComponentName = this.t((c as SnippetMeta).schema?.componentName);
    // 获取组件描述的翻译文本（如果存在description属性）
    const strDescription = "description" in c ? this.t(c.description):'';
    // 获取组件关键词的翻译文本（如果存在keywords属性）
    const strKeywords = "keywords" in c ? this.getStrKeywords(c.keywords||[]):'';
    // 将所有搜索关键字用#连接并转为小写
    return  `${strTitle}#${strComponentName}#${strDescription}#${strKeywords}`.toLowerCase();
  }

  // 获取过滤后的组件列表，使用防抖优化性能（200ms延迟）
  getFilteredComponents = debounce(() => {
    // 从状态中解构获取组件分组和搜索关键词
    const { groups = [], keyword } = this.state;
    // 如果没有搜索关键词，显示所有组件
    if (!keyword) {
      this.setState({
        filter: groups,  // 将过滤结果设为原始分组数据
      });
      return;
    }

    // 空行用于代码分段

    // 根据关键词过滤组件
    const filter = groups.map((group) => ({
      ...group,  // 保留分组的其他属性
      // 过滤分类数据
      categories: group.categories
        .map((category) => ({
          ...category,  // 保留分类的其他属性
          // 过滤组件列表
          components: category.components.filter((c) => {
            // 获取组件的搜索关键字
            let keyToSearch =  this.getKeyToSearch(c);
            // 如果组件有代码片段，也加入搜索范围
            if(c.snippets){
              c.snippets.map((item)=>{
                keyToSearch += `_${this.getKeyToSearch(item)}`
              })
            }
            // 判断搜索关键字是否包含用户输入的关键词
            return keyToSearch.includes(keyword);
          }),
        }))
        // 过滤掉没有组件的分类
        .filter((c) => c?.components?.length),
    }));

    // 更新状态，设置过滤结果
    this.setState({
      filter,
    });
  }, 200);

  // 构造函数
  constructor(props) {
    // 调用父类构造函数
    super(props);
    // 根据语言设置获取文本翻译函数
    this.t = getTextReader(props.lang);
    // 定义获取字符串关键词的函数
    this.getStrKeywords = (keywords: Text[]): string => {
      // 如果关键词是字符串类型，直接返回
      if (typeof keywords === 'string') {
        return keywords;
      }
      // 如果关键词是非空数组，将每个关键词翻译后用'-'连接
      if (keywords && Array.isArray(keywords) && keywords.length) {
        return keywords.map(keyword => this.t(keyword)).join('-');
      }
      // 否则返回空字符串
      return '';
    };
  }

  // 组件挂载后的生命周期方法
  componentDidMount() {
    // 从props中获取编辑器实例
    const { editor } = this.props;
    // 如果没有编辑器实例，直接初始化组件列表
    if (!editor) {
      this.initComponentList();
      return;
    }
    // 根据引擎版本获取物料资源
    const assets = isNewEngineVersion ? material.getAssets() : editor.get('assets');
    // 如果资源已就绪，初始化组件列表
    if (assets) {
      this.initComponentList();
    } else {
      // 如果资源未就绪，输出警告信息
      console.warn('[ComponentsPane]: assets not ready, wait for assets ready event.')
    }

    // 根据引擎版本监听不同的事件
    if (isNewEngineVersion) {
      // 新版本引擎：监听trunk变化和资源变化事件
      event.on('trunk.change', this.initComponentList.bind(this));
      material.onChangeAssets(this.initComponentList.bind(this));
    } else {
      // 旧版本引擎：监听相应的编辑器事件
      editor.on('trunk.change', this.initComponentList.bind(this));
      editor.once('editor.ready', this.initComponentList.bind(this));
      editor.on('designer.incrementalAssetsReady', this.initComponentList.bind(this));
    }
  }

  /**
   * 初始化组件列表
   * TODO: 无副作用，可多次执行
   */
  initComponentList() {
    // 从props中获取编辑器实例
    const { editor } = this.props;
    // 根据引擎版本获取原始物料数据
    const rawData = isNewEngineVersion ? material.getAssets() : editor.get('assets');

    // 使用transform函数转换原始数据为标准格式
    const meta = transform(rawData, this.t);

    // 从转换后的数据中解构获取分组和代码片段
    const { groups, snippets } = meta;

    // 将代码片段存储到管理器中
    this.store.setSnippets(snippets);

    // 更新组件状态
    this.setState({
      groups,        // 设置组件分组数据
      filter: groups, // 初始化时过滤结果与分组数据相同
    });
  }

  // 注册拖拽功能的方法
  registerAdditive = (shell: HTMLDivElement | null) => {
    // 如果容器不存在或已经注册过，直接返回
    if (!shell || shell.dataset.registered) {
      return;
    }

    // 获取代码片段ID的内部函数
    function getSnippetId(elem: any) {
      // 如果元素不存在，返回null
      if (!elem) {
        return null;
      }
      // 向上遍历DOM树，查找包含'snippet'类名的元素
      while (shell !== elem) {
        if (elem.classList.contains('snippet')) {
          // 返回该元素的data-id属性值
          return elem.dataset.id;
        }
        // 继续向上查找父节点
        elem = elem.parentNode;
      }
      return null;
    }

    // 获取编辑器实例
    const { editor } = this.props;
    // 根据引擎版本获取设计器实例
    const designer = !isNewEngineVersion ? editor?.get('designer') : null;
    // 根据引擎版本获取拖拽引擎实例
    const _dragon = isNewEngineVersion ? common.designerCabin.dragon : designer?.dragon;
    // 如果拖拽引擎不存在，直接返回
    if (!_dragon || (!isNewEngineVersion && !designer)) {
      return;
    }

    // 定义点击事件处理函数（当前为空实现）
    // eslint-disable-next-line
    const click = (e: Event) => {};

    // 为容器添加点击事件监听器
    shell.addEventListener('click', click);

    // 注册拖拽源，定义拖拽时返回的数据
    _dragon.from(shell, (e: Event) => {
      // 根据引擎版本获取当前文档实例
      const doc = isNewEngineVersion ? project.getCurrentDocument() : designer?.currentDocument;
      // 获取拖拽目标的代码片段ID
      const id = getSnippetId(e.target);
      // 如果文档不存在或ID无效，返回false阻止拖拽
      if (!doc || !id) {
        return false;
      }

      // 构造拖拽数据对象
      const dragTarget = {
        type: 'nodedata',                      // 标识为节点数据类型
        data: this.store.getSnippetById(id),   // 从存储中获取对应的代码片段数据
      };

      // 返回拖拽数据
      return dragTarget;
    });

    // 标记容器已注册，避免重复注册
    shell.dataset.registered = 'true';
  };

  // 处理搜索的方法
  handleSearch = (keyword = '') => {
    // 更新状态中的搜索关键词（转为小写）
    this.setState({
      keyword: keyword.toLowerCase(),
    });
    // 触发组件过滤
    this.getFilteredComponents();
  };

  // 渲染空内容的方法
  renderEmptyContent() {
    return (
      // 空状态容器
      <div className={cx('empty')}>
        {/* 空状态图片 */}
        <img src="//g.alicdn.com/uxcore/pic/empty.png" />
        {/* 空状态提示文本 */}
        <div className={cx('content')}>{this.t(createI18n('暂无组件，请在物料站点添加', 'No components, please add materials'))}</div>
      </div>
    )
  }

  // 渲染主要内容的方法
  renderContent() {
    // 从状态中获取过滤后的数据和搜索关键词
    const { filter = [], keyword } = this.state;
    // 检查是否有内容需要显示
    const hasContent = filter.filter(item => {
      return item?.categories?.filter(category => {
        return category?.components?.length;
      }).length;
    }).length;
    // 如果没有内容，显示空状态
    if (!hasContent) {
      return this.renderEmptyContent();
    }
    // 如果有搜索关键词，显示搜索结果
    if (keyword) {
      return (
        // 搜索结果容器，注册拖拽功能
        <div ref={this.registerAdditive} className={cx('filtered-content')}>
          {/* 遍历过滤后的分组 */}
          {filter.map((group) => {
            const { categories } = group;
            {/* 遍历分组中的分类 */}
            {return categories.map((category) => {
              const { components } = category;
              // 获取分类名称的翻译
              const cname = this.t(category.name);
              return (
                // 渲染分类组件
                <Category key={cname} name={cname}>
                  <List>
                    {/* 遍历分类中的组件 */}
                    {components.map((component) => {
                      const { componentName, snippets = [] } = component;
                      // 过滤包含搜索关键词的代码片段并渲染
                      return snippets.filter(snippet => snippet.id && this.getKeyToSearch(snippet).toLowerCase().includes(keyword)).map(snippet => {
                        return (
                          // 渲染单个组件
                          <Component
                            data={{
                              title: snippet.title || component.title,  // 组件标题
                              icon: snippet.screenshot || component.icon, // 组件图标
                              snippets: [snippet]  // 代码片段数据
                            }}
                            key={`${this.t(group.name)}_${this.t(componentName)}_${this.t(snippet.title)}`}
                            t={this.t}
                          />
                        );
                      });
                    })}
                  </List>
                </Category>
              );
            })}
          })}
        </div>
      )
    }
    // 没有搜索关键词时，显示标签页布局
    return (
      // 选项卡容器
      <Tab className={cx('tabs')}>
        {/* 遍历过滤后的分组，每个分组对应一个选项卡 */}
        {filter.map((group) => {
          const { categories } = group;
          return (
            // 选项卡项，标题为分组名称
            <Tab.Item title={this.t(group.name)} key={this.t(group.name)}>
              {/* 选项卡内容容器，注册拖拽功能 */}
              <div ref={this.registerAdditive}>
                {/* 遍历分组中的分类 */}
                {categories.map((category) => {
                  const { components } = category;
                  // 获取分类名称的翻译
                  const cname = this.t(category.name);
                  return (
                    // 渲染分类组件
                    <Category key={cname} name={cname}>
                      <List>
                        {/* 遍历分类中的组件 */}
                        {components.map((component) => {
                          const { componentName, snippets = [] } = component;
                          // 过滤有效的代码片段并渲染
                          return snippets.filter(snippet => snippet.id).map(snippet => {
                            return (
                              // 渲染单个组件
                              <Component
                                data={{
                                  title: snippet.title || component.title,  // 组件标题
                                  icon: snippet.screenshot || component.icon, // 组件图标
                                  snippets: [snippet]  // 代码片段数据
                                }}
                                t={this.t}
                                key={`${this.t(group.name)}_${this.t(componentName)}_${this.t(snippet.title)}`}
                              />
                            );
                          });
                        })}
                      </List>
                    </Category>
                  );
                })}
              </div>
            </Tab.Item>
          );
        })}
      </Tab>
    );
  }

  // 组件的主渲染方法
  render() {
    return (
      // 组件面板主容器
      <div className={cx('lowcode-component-panel')}>
        {/* 头部区域，包含搜索框 */}
        <div className={cx('header')}>
          <Search
            className={cx('search')}
            placeholder={this.t(createI18n('搜索组件', 'Search components'))}  // 搜索框占位符
            shape="simple"           // 简单样式
            hasClear                 // 显示清除按钮
            autoFocus               // 自动聚焦
            onSearch={this.handleSearch}   // 搜索事件处理
            onChange={this.handleSearch}   // 输入变化事件处理
          />
        </div>
        {/* 渲染主要内容区域 */}
        {this.renderContent()}
      </div>
    );
  }
}

// 导出面板图标组件
export const PaneIcon = IconOfPane;
