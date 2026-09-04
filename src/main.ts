import { mount } from 'svelte';
import App from './App.svelte';
import GithubScripts from './lib/GithubScripts.svelte';
import '@xyflow/svelte/dist/style.css';
import './app.css';
import './selection-fix.css';

mount(App, {
  target: document.getElementById('app')!
});

const githubUi = document.createElement('div');
githubUi.id = 'zenode-github-scripts';
document.body.appendChild(githubUi);

mount(GithubScripts, {
  target: githubUi
});
