export const processOCRData = (ocrResponse) => {
    if (!ocrResponse || !ocrResponse.pages) {
        return { totalPages: 0, pages: [] };
    }

    return {
        totalPages: ocrResponse.pages.length,
        pages: ocrResponse.pages.map((page, index) => ({
            id: `page-${index + 1}`,
            pageNumber: index + 1,
            markdown: page.markdown || '',
            images: page.images || [],
            cleanMarkdown: (page.markdown || '')
                .trim()
                .replace(/\n{3,}/g, '\n\n')
                .replace(/^\s+/gm, '')
                .replace(/\t/g, '    '),
            hasContent: !!(page.markdown && page.markdown.trim()),
            hasImages: (page.images || []).length > 0,
            contentLength: (page.markdown || '').length
        }))
    };
};