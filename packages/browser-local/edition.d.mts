import type {BookDraft} from '../../apps/web/src/book-types';
import type {Photo,Page} from '../../apps/browser/src/model';
export function editionPages(book:BookDraft):Page[];
export function validateEdition(book:BookDraft,photos:Photo[]):void;
