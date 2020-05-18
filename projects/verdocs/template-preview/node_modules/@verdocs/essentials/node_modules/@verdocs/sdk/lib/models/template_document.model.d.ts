export interface ITemplateDocument {
    url: string;
    name: string;
    page_numbers: number;
    id?: string;
    updated_at?: Date;
    created_at?: Date;
    template_id: string;
    thumbnail_url: string;
    thumbnail_safe?: any;
    mime: string;
}
