<template>
  <!--
    时段氛围装饰层（纯展示，无脚本逻辑）
    依据 <html data-theme> 的时段主题，由 period-atmosphere.css 控制下列各层的显隐：
    晨间/正午显示 sun+rays+birds，暮色显示 dusk，星夜显示 moon+stars。
    各元素生成数量固定（12 道光线 / 12 颗星 / 3 只飞鸟），配合 CSS 伪随机偏移。
  -->
  <div class="period-atm" aria-hidden="true">
    <!-- 底部色彩晕染与光斑、雾气 -->
    <div class="atm-wash" />
    <div class="atm-dots" />
    <div class="atm-glow" />
    <div class="atm-mist" />
    <!-- 白昼元素：太阳与放射光线 -->
    <div class="atm-sun" />
    <div class="atm-rays">
      <i v-for="n in 12" :key="'r' + n" />
    </div>
    <!-- 暮色渐变层 -->
    <div class="atm-dusk" />
    <!-- 夜晚元素：月亮与星星 -->
    <div class="atm-moon" />
    <div class="atm-stars">
      <i v-for="n in 12" :key="'s' + n" />
    </div>
    <!-- 飞鸟剪影（白昼时段可见） -->
    <div class="atm-birds">
      <i v-for="n in 3" :key="'b' + n" />
    </div>
  </div>
</template>
